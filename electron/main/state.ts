/**
 * Central runtime state & renderer notification hub.
 *
 * Owns the single ItemStore and ClipboardWatcher instances and provides typed
 * helpers to broadcast changes to the renderer. Every mutation goes through
 * here so there's one path that re-pushes the DTO list.
 */
import { ItemStore } from '../store/ItemStore'
import { ClipboardWatcher } from '../clipboard/ClipboardWatcher'
import { loadSettings, saveSettings } from '../store/settings'
import type { ClipboardItemDto, Settings } from '../../shared/types'
import { MAX_STACK } from '../../shared/types'
import { getMainWindow } from './window'
import { createId } from '../store/ids'
import { nativeImage } from 'electron'
import { readFileSync } from 'node:fs'
import { PATHS } from '../store/paths'
import { prefetchFileIcons } from './drag'
import { runtime } from './config'
import { buildTextData } from '../clipboard/formats'
import { pruneTransferExpired } from '../transfer/service'

const store = new ItemStore()
const watcher = new ClipboardWatcher(600)
let pruneTimer: ReturnType<typeof setInterval> | null = null

/** Initialize persistence + start the clipboard watcher. */
export function initState(): void {
  store.load()
  if (loadSettings().clearUnpinnedOnRestart) {
    store.clearUnpinned()
  }
  store.pruneExpired(loadSettings().autoDeleteHours)

  for (const item of store.toDto()) {
    if (item.data.kind === 'files' && item.data.paths) {
      prefetchFileIcons(item.data.paths)
    }
  }
  watcher.start((data, png) => {
    if (loadSettings().incognito) return
    store.pruneExpired(loadSettings().autoDeleteHours)
    if (data.kind === 'image' && png && data.imageId) {
      store.stageImageBytes(data.imageId, png)
    }
    if (data.kind === 'files' && data.paths) {
      prefetchFileIcons(data.paths)
    }
    store.add(data, loadSettings().historyLimit)
    pushState.items()
  })
  watcher.setPaused(loadSettings().incognito)

  // After a restart-clear, the watcher.start() seeds lastSig from the live
  // clipboard (correct). But if clearUnpinnedOnRestart removed items that are
  // still on the clipboard, the user can re-copy them immediately — this works
  // because start() always re-seeds lastSig fresh from the current clipboard.
  // No extra invalidate() is needed here.

  if (pruneTimer !== null) clearInterval(pruneTimer)
  pruneTimer = setInterval(() => {
    if (runtime.quitting) return
    if (store.pruneExpired(loadSettings().autoDeleteHours)) {
      // Pruned items should be re-capturable if still on the clipboard.
      watcher.resyncSignature()
      pushState.items()
    }
    pruneTransferExpired()
  }, 60_000)
}

export function stopStateTimers(): void {
  if (pruneTimer !== null) {
    clearInterval(pruneTimer)
    pruneTimer = null
  }
}

export function getStore(): ItemStore {
  return store
}

export function getWatcher(): ClipboardWatcher {
  return watcher
}

/** Push the full item list (DTO) to the renderer, if it's ready. */
function send(channel: string, ...args: unknown[]): void {
  if (runtime.quitting) return
  const win = getMainWindow()
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, ...args)
}

export const pushState = {
  items(): void {
    const dto: ClipboardItemDto[] = store.toDto()
    send('state:items', dto)
  },
  settings(next: Settings): void {
    send('state:settings', next)
  },
  togglePanel(open?: boolean): void {
    console.log(`[Main] Sending window:toggle event to renderer with open=${open}`)
    send('window:toggle', open)
  },
  openSettings(): void {
    console.log('[Main] Sending window:open-settings event to renderer')
    send('window:open-settings')
  }
}

/** Re-export for handlers that mutate settings then need to broadcast. */
export { loadSettings, saveSettings }

/**
 * Result of importing dropped files: how many stacks were created and whether
 * any overflow was chunked, so the IPC layer can show an informative toast.
 */
export interface AddFilesResult {
  /** Total number of separate items/stacks created (1 means a single bundle). */
  stacksCreated: number
}

/**
 * Import dropped file paths.
 *
 * Drops are partitioned into images vs. other files (so a mixed drop of e.g.
 * 2 images + 3 docs becomes an image-collection *and* a files bundle instead of
 * collapsing everything into a generic bundle that loses image previews). Each
 * partition is then chunked into stacks of at most MAX_STACK items.
 */

/** Map a file extension to a MIME for the nativeImage data-URL fallback. */
function extToMime(ext: string): string {
  switch (ext) {
    case 'svg': return 'image/svg+xml'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'bmp': return 'image/bmp'
    case 'avif': return 'image/avif'
    case 'ico': return 'image/x-icon'
    case 'jpg': case 'jpeg': case 'jfif': case 'pjpeg': case 'pjp': return 'image/jpeg'
    case 'tif': case 'tiff': return 'image/tiff'
    default: return 'image/png'
  }
}

/**
 * Build an image entry (id + dimensions + staged bytes) from raw image bytes.
 * Returns null if the bytes can't be decoded as an image at all. Used by both
 * the file-drop and URL-drop paths so they share the same dimension logic.
 */
function buildImageEntry(rawBytes: Buffer, ext: string): { imageId: string; width: number; height: number; bytes: number; ext: string } | null {
  let img = nativeImage.createFromBuffer(rawBytes)
  if (img.isEmpty()) {
    const mime = extToMime(ext)
    const dataUrl = `data:${mime};base64,${rawBytes.toString('base64')}`
    img = nativeImage.createFromDataURL(dataUrl)
  }

  let width = 300
  let height = 300
  if (!img.isEmpty()) {
    const size = img.getSize()
    if (size.width > 0 && size.height > 0) {
      width = size.width
      height = size.height
    }
  } else if (rawBytes.length === 0) {
    return null
  }

  const imageId = createId()
  store.stageImageBytes(imageId, rawBytes, ext)
  return { imageId, width, height, bytes: rawBytes.length, ext }
}

/**
 * Fetch an image from a URL (a picture dragged in from a browser) and add it
 * as an image item. Supports http(s) URLs (fetched with a browser-like UA and
 * redirect following) and `data:` URLs (decoded inline). Throws on fetch
 * failure so the IPC layer can show an informative toast.
 */
export async function addImageFromUrl(url: string): Promise<boolean> {
  let rawBytes: Buffer
  let ext = 'png'

  const dataMatch = url.match(/^data:([^;]+)?;base64,([\s\S]+)$/i)
  if (dataMatch) {
    const media = (dataMatch[1] || 'image/png').toLowerCase()
    rawBytes = Buffer.from(dataMatch[2], 'base64')
    ext = media.split('/')[1]?.split('+')[0] || 'png'
  } else {
    if (!/^https?:\/\//i.test(url)) throw new Error('不支持的图片地址')
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'image/*,*/*;q=0.8'
      }
    })
    if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`)
    rawBytes = Buffer.from(await res.arrayBuffer())
    const ctype = (res.headers.get('content-type') || '').toLowerCase()
    if (ctype.startsWith('image/')) {
      ext = ctype.split('/')[1].split('+')[0] || 'png'
    } else {
      const m = url.match(/\.([a-z0-9]+)(?:[?#]|$)/i)
      ext = m ? m[1].toLowerCase() : 'png'
    }
  }

  const entry = buildImageEntry(rawBytes, ext)
  if (!entry) throw new Error('无法识别的图片数据')
  const limit = loadSettings().historyLimit
  const changed = store.add({ kind: 'image', ...entry }, limit)
  if (changed) pushState.items()
  return changed
}

export function addFiles(paths: string[]): AddFilesResult {
  // Prevent duplicating items when a user accidentally drops our own staged temp
  // files back into the app. Real files are deduplicated automatically by path,
  // but images are staged to temp-drag and would otherwise get new IDs.
  const clean = paths.filter((p) => !p.startsWith(PATHS.tempDir()))
  if (clean.length === 0) return { stacksCreated: 0 }

  const imageExts = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?|jfif|pjpeg|pjp)$/i
  const imagePaths: string[] = []
  const otherPaths: string[] = []
  for (const p of clean) (imageExts.test(p) ? imagePaths : otherPaths).push(p)

  if (otherPaths.length > 0) {
    prefetchFileIcons(otherPaths)
  }

  const limit = loadSettings().historyLimit
  let stacksCreated = 0

  // --- images -> image collections (chunked to MAX_STACK) ---
  if (imagePaths.length > 0) {
    const images = []
    for (const p of imagePaths) {
      try {
        const rawBytes = readFileSync(p)
        const ext = p.split('.').pop()?.toLowerCase() || 'png'
        const entry = buildImageEntry(rawBytes, ext)
        if (entry) images.push(entry)
        else otherPaths.push(p) // unreadable / non-image -> treat as plain file
      } catch {
        otherPaths.push(p) // unreadable -> treat as plain file
      }
    }

    for (let i = 0; i < images.length; i += MAX_STACK) {
      const chunk = images.slice(i, i + MAX_STACK)
      if (chunk.length === 1) {
        store.add({ kind: 'image', ...chunk[0] }, limit)
      } else {
        store.add({ kind: 'image-collection', images: chunk }, limit)
      }
      stacksCreated++
    }
  }

  // --- other files -> files bundles (chunked to MAX_STACK) ---
  for (let i = 0; i < otherPaths.length; i += MAX_STACK) {
    const chunk = otherPaths.slice(i, i + MAX_STACK)
    store.add({ kind: 'files', paths: chunk }, limit)
    stacksCreated++
  }

  if (stacksCreated > 0) pushState.items()
  return { stacksCreated }
}

/**
 * Import dragged-in text (a text selection dropped from another app).
 * Classifies it as URL / color the same way the clipboard reader does, then
 * adds it as a text item. Returns true if the store actually changed.
 */
export function addText(text: string, html?: string): boolean {
  const data = buildTextData(text, html)
  if (!data.text) return false
  const limit = loadSettings().historyLimit
  const changed = store.add(data, limit)
  if (changed) pushState.items()
  return changed
}
