/**
 * High-level transfer orchestration: resolve clipboard items into shareable
 * snapshots, stage clipboard content, generate QR codes, push state to UI.
 */
import { basename } from 'node:path'
import { existsSync, writeFileSync, statSync } from 'node:fs'
import { clipboard, nativeImage, dialog } from 'electron'
import type {
  QrResult,
  TransferStateDto,
  TransferTarget,
  TransferPayload
} from '../../shared/types'
import { getStore } from '../main/state'
import { loadSettings } from '../store/settings'
import { PATHS } from '../store/paths'
import { createId } from '../store/ids'
import { getMainWindow } from '../main/window'
import {
  listBundles,
  stagePayload,
  stageFiles,
  removeItem,
  removeBundle,
  getDefaultBundleId,
  getBundle,
  pruneExpired as pruneStaging
} from './stagingStore'
import {
  createToken,
  putToken,
  revokeToken,
  getActiveToken,
  pruneExpiredTokens,
  type SnapshotFile
} from './tokenStore'
import { toQrDataUrl } from './qr'
import { buildShareUrl, getLanIp, getTransferPort, refreshLanIp, listLanIps, setPreferredLanIp } from './server'
import { transferToast } from './notify'

/** 二维码默认有效期：30 分钟（与剪贴板 autoDeleteHours 无关）。 */
export const QR_TTL_MS = 30 * 60 * 1000

let firewallHintShown = false

function expiresAtForQr(): number {
  // 二维码独立 TTL，不复用剪贴板历史的 autoDeleteHours
  return Date.now() + QR_TTL_MS
}

/** 发给手机的图片友好文件名，例如 截图-20260327-143052.png */
export function formatShareImageName(ext = 'png'): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const clean = (ext || 'png').replace(/^\./, '')
  return `截图-${stamp}.${clean}`
}

function clipboardItemToSnapshot(id: string): SnapshotFile[] | null {
  const item = getStore().get(id)
  if (!item) return null
  const data = item.data

  if (data.kind === 'text') {
    return [
      {
        text: data.text,
        name: data.isUrl ? '链接.txt' : '剪贴板文本.txt',
        size: Buffer.byteLength(data.text, 'utf8'),
        mime: 'text/plain; charset=utf-8'
      }
    ]
  }

  if (data.kind === 'image') {
    const path = getStore().getImagePath(data.imageId, data.ext)
    if (!existsSync(path)) return null
    return [
      {
        path,
        name: formatShareImageName(data.ext || 'png'),
        size: data.bytes || safeSize(path),
        mime: `image/${data.ext || 'png'}`
      }
    ]
  }

  if (data.kind === 'image-collection') {
    const out: SnapshotFile[] = []
    let i = 0
    for (const img of data.images) {
      const path = getStore().getImagePath(img.imageId, img.ext)
      if (!existsSync(path)) continue
      i += 1
      const base = formatShareImageName(img.ext || 'png').replace(/\.[^.]+$/, '')
      const ext = (img.ext || 'png').replace(/^\./, '')
      out.push({
        path,
        name: i === 1 ? `${base}.${ext}` : `${base}-${i}.${ext}`,
        size: img.bytes || safeSize(path),
        mime: `image/${ext}`
      })
    }
    return out
  }

  if (data.kind === 'files') {
    return data.paths
      .filter((p) => existsSync(p))
      .map((p) => ({
        path: p,
        name: basename(p),
        size: safeSize(p)
      }))
  }

  return null
}

function safeSize(p: string): number {
  try {
    return statSync(p).size
  } catch {
    return 0
  }
}

export function getTransferState(): TransferStateDto {
  refreshLanIp()
  return {
    bundles: listBundles(),
    activeToken: getActiveToken(),
    lanIp: getLanIp(),
    lanIps: listLanIps(),
    port: getTransferPort()
  }
}

export function pushTransferState(): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('transfer:state', getTransferState())
  }
}

export async function generateQr(target: TransferTarget): Promise<QrResult> {
  refreshLanIp()
  const lanIp = getLanIp()
  const port = getTransferPort()
  if (!lanIp || !port) {
    throw new Error('无法获取局域网地址，请确认电脑已连接 Wi-Fi')
  }

  const token = createToken()
  const expiresAt = expiresAtForQr()

  if (target.kind === 'item') {
    const files = clipboardItemToSnapshot(target.id)
    if (!files || files.length === 0) {
      throw new Error('该项无法发送（文件可能已删除）')
    }
    putToken(token, { kind: 'snapshot', files, expiresAt })
  } else {
    const bundle = getBundle(target.bundleId)
    if (!bundle || bundle.items.length === 0) {
      throw new Error('暂存箱为空')
    }
    putToken(token, {
      kind: 'bundle',
      bundleId: bundle.id,
      version: bundle.version,
      expiresAt
    })
  }

  const url = buildShareUrl(token)
  if (!url) throw new Error('无法生成分享链接')

  const qrDataUrl = await toQrDataUrl(url)
  pushTransferState()
  // 首次生成时提醒一次防火墙（弹层上也有常驻文案）
  if (!firewallHintShown) {
    firewallHintShown = true
    transferToast('若手机打不开链接，请在防火墙中允许 Edge-Drop（专用网络）', 'info')
  }
  return { token, url, qrDataUrl, expiresAt, lanIp }
}

export function doRevokeQr(token: string): boolean {
  const ok = revokeToken(token)
  pushTransferState()
  return ok
}

export function doStageFiles(paths: string[]): TransferStateDto {
  stageFiles(paths, getDefaultBundleId())
  pushTransferState()
  return getTransferState()
}

/** 把剪贴板历史里的一项加入默认暂存箱。 */
export function doStageHistoryItem(itemId: string): TransferStateDto {
  const files = clipboardItemToSnapshot(itemId)
  if (!files || files.length === 0) {
    throw new Error('该项无法加入暂存箱（文件可能已删除）')
  }
  for (const f of files) {
    if (f.text !== undefined) {
      stagePayload({
        kind: 'text',
        text: f.text,
        name: f.name
      })
    } else if (f.path) {
      const isImg = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?)$/i.test(f.name)
      stagePayload(
        isImg
          ? { kind: 'image', path: f.path, name: f.name, size: f.size }
          : { kind: 'file', path: f.path, name: f.name, size: f.size }
      )
    }
  }
  pushTransferState()
  return getTransferState()
}

export function doStageClipboard(): TransferStateDto {
  const formats = clipboard.availableFormats()
  const hasFileFormat = formats.some((f) => /FileNameW|FileDrop|CF_HDROP/i.test(f))

  // Files first (Explorer copy often also puts a thumbnail image on the clipboard)
  if (hasFileFormat) {
    try {
      const buf = clipboard.readBuffer('FileNameW')
      if (buf && buf.length >= 4) {
        const wide = buf.toString('utf16le')
        const paths = wide
          .split('\u0000')
          .map((s) => s.trim())
          .filter((line) => line.length > 0 && existsSync(line))
        if (paths.length > 0) {
          stageFiles(paths)
          pushTransferState()
          const label =
            paths.length === 1
              ? `已放入：${basename(paths[0])}`
              : `已放入 ${paths.length} 个文件`
          transferToast(label, 'info')
          return getTransferState()
        }
      }
    } catch {
      /* fall through */
    }
  }

  const img = clipboard.readImage()
  if (!img.isEmpty()) {
    const png = img.toPNG()
    const id = createId()
    const name = formatShareImageName('png')
    const filePath = `${PATHS.transferTempDir()}/${id}.png`
    writeFileSync(filePath, png)
    const payload: TransferPayload = {
      kind: 'image',
      path: filePath,
      name,
      size: png.length
    }
    stagePayload(payload)
    pushTransferState()
    transferToast(`已放入：${name}`, 'info')
    return getTransferState()
  }

  const text = clipboard.readText()
  if (text && text.trim()) {
    const preview = text.trim().slice(0, 24)
    stagePayload({
      kind: 'text',
      text,
      name: '剪贴板文本.txt'
    })
    pushTransferState()
    transferToast(`已放入文本：${preview}${text.trim().length > 24 ? '…' : ''}`, 'info')
    return getTransferState()
  }

  throw new Error('当前剪贴板没有可传输的内容')
}

export function doRemoveItem(bundleId: string, itemId: string): TransferStateDto {
  removeItem(bundleId, itemId)
  pushTransferState()
  return getTransferState()
}

export function doRemoveBundle(bundleId: string): TransferStateDto {
  removeBundle(bundleId)
  pushTransferState()
  return getTransferState()
}

export async function pickFiles(): Promise<string[]> {
  const win = getMainWindow()
  const opts: Electron.OpenDialogOptions = {
    title: '添加到暂存箱',
    properties: ['openFile', 'multiSelections'],
    buttonLabel: '添加'
  }
  const result =
    win && !win.isDestroyed()
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
  if (result.canceled || !result.filePaths.length) return []
  return result.filePaths
}

export function doSetLanIp(ip: string | null): TransferStateDto {
  setPreferredLanIp(ip)
  pushTransferState()
  return getTransferState()
}

export function pruneTransferExpired(): boolean {
  const hours = loadSettings().autoDeleteHours
  const a = pruneStaging(hours)
  const b = pruneExpiredTokens()
  if (a || b) pushTransferState()
  return a || b
}

// nativeImage import used via clipboard.readImage
void nativeImage
