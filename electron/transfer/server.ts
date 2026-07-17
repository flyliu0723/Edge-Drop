/**
 * Local HTTP server that phones hit after scanning a transfer QR code.
 *
 * Routes:
 *   GET /d/:token          — single file download / text page / multi-file list
 *   GET /d/:token/file/:i  — download one file from a multi-file share
 *   GET /d/:token/zip      — zip all binary files in the share
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { networkInterfaces } from 'node:os'
import { getToken, type SnapshotFile } from './tokenStore'
import { getBundle } from './stagingStore'
import { renderTextPage, renderListPage, renderGonePage, renderErrorPage, type ListFileMeta } from './web'
import { transferToast } from './notify'

const START_PORT = 7331
const MAX_PORT_TRIES = 20

/** 每个 token 只提示一次「已打开」，避免列表页反复刷新刷屏。 */
const openedTokens = new Set<string>()

function noteOpened(token: string, kind: 'page' | 'download', label?: string): void {
  if (kind === 'page') {
    if (openedTokens.has(token)) return
    openedTokens.add(token)
    transferToast('手机已打开传输链接', 'info')
    return
  }
  transferToast(label ? `手机已下载：${label}` : '手机已开始下载', 'info')
}

let server: Server | null = null
let boundPort: number | null = null
let cachedLanIp: string | null = null

export function getTransferPort(): number | null {
  return boundPort
}

/** Prefer a private IPv4 that is not a virtual adapter / APIPA. */
function listCandidateIps(): string[] {
  const nets = networkInterfaces()
  const candidates: string[] = []
  for (const name of Object.keys(nets)) {
    const entries = nets[name]
    if (!entries) continue
    for (const net of entries) {
      // Node typings: family may be 'IPv4' | 'IPv6' or numeric 4 | 6 depending on version
      const family = net.family as string | number
      const isV4 = family === 'IPv4' || family === 4
      if (!isV4 || net.internal) continue
      if (net.address.startsWith('169.254.')) continue
      if (!candidates.includes(net.address)) candidates.push(net.address)
    }
  }
  // Prefer 192.168 / 10 / 172.16-31 first
  return candidates.sort((a, b) => scoreIp(b) - scoreIp(a))
}

function scoreIp(a: string): number {
  if (a.startsWith('192.168.')) return 3
  if (a.startsWith('10.')) return 2
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(a)) return 1
  return 0
}

/** Manual override (null = auto pick best). */
let preferredLanIp: string | null = null

export function listLanIps(): string[] {
  return listCandidateIps()
}

export function getPreferredLanIp(): string | null {
  return preferredLanIp
}

export function setPreferredLanIp(ip: string | null): string | null {
  const candidates = listCandidateIps()
  if (ip && !candidates.includes(ip)) {
    // stale selection — fall back to auto
    preferredLanIp = null
  } else {
    preferredLanIp = ip
  }
  cachedLanIp = preferredLanIp ?? candidates[0] ?? null
  return cachedLanIp
}

export function getLanIp(): string | null {
  if (preferredLanIp) {
    const candidates = listCandidateIps()
    if (candidates.includes(preferredLanIp)) return preferredLanIp
    preferredLanIp = null
  }
  return cachedLanIp ?? detectLanIp()
}

export function refreshLanIp(): string | null {
  const candidates = listCandidateIps()
  if (preferredLanIp && candidates.includes(preferredLanIp)) {
    cachedLanIp = preferredLanIp
  } else {
    preferredLanIp = null
    cachedLanIp = candidates[0] ?? null
  }
  return cachedLanIp
}

function detectLanIp(): string | null {
  return listCandidateIps()[0] ?? null
}

export function buildShareUrl(token: string): string | null {
  const ip = getLanIp()
  if (!ip || !boundPort) return null
  return `http://${ip}:${boundPort}/d/${token}`
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  const buf = Buffer.from(html, 'utf8')
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store'
  })
  res.end(buf)
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_')
  const encoded = encodeURIComponent(filename)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

function guessMime(path: string): string {
  const ext = extname(path).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json',
    '.zip': 'application/zip',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg'
  }
  return map[ext] ?? 'application/octet-stream'
}

/** Resolve a token into a flat list of snapshot files (or null if gone). */
function resolveFiles(token: string): SnapshotFile[] | null {
  const entry = getToken(token)
  if (!entry) return null

  if (entry.kind === 'snapshot') {
    return entry.files
  }

  // Live bundle lookup with version check
  const bundle = getBundle(entry.bundleId)
  if (!bundle || bundle.version !== entry.version) return null
  return bundle.items.map((it) => {
    if (it.payload.kind === 'text') {
      return {
        text: it.payload.text,
        name: it.payload.name || '剪贴板文本.txt',
        size: Buffer.byteLength(it.payload.text, 'utf8'),
        mime: 'text/plain; charset=utf-8'
      }
    }
    return {
      path: it.payload.path,
      name: it.payload.name,
      size: it.payload.size,
      mime: guessMime(it.payload.path)
    }
  })
}

function streamFile(res: ServerResponse, filePath: string, name: string, onDone?: () => void): void {
  if (!existsSync(filePath)) {
    sendHtml(res, 404, renderErrorPage('文件不存在或已被移动'))
    return
  }
  let size = 0
  try {
    size = statSync(filePath).size
  } catch {
    sendHtml(res, 404, renderErrorPage('无法读取文件'))
    return
  }
  res.writeHead(200, {
    'Content-Type': guessMime(filePath),
    'Content-Length': size,
    'Content-Disposition': contentDisposition(name),
    'Cache-Control': 'no-store'
  })
  const stream = createReadStream(filePath)
  let finished = false
  const done = () => {
    if (finished) return
    finished = true
    onDone?.()
  }
  res.on('finish', done)
  res.on('close', done)
  stream.pipe(res)
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const path = url.pathname

    // CORS not needed (same-origin from phone browser navigating to the URL)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }

    // /d/:token[/file/:idx|/zip]
    const m = path.match(/^\/d\/([a-f0-9]+)(?:\/(file|zip)(?:\/(\d+))?)?\/?$/i)
    if (!m) {
      sendHtml(res, 404, renderErrorPage('未知路径'))
      return
    }

    const token = m[1].toLowerCase()
    const action = m[2] // undefined | 'file' | 'zip'
    const fileIdx = m[3] !== undefined ? parseInt(m[3], 10) : -1

    const files = resolveFiles(token)
    if (!files || files.length === 0) {
      sendHtml(res, 410, renderGonePage())
      return
    }

    // ZIP all binary (path-based) files
    if (action === 'zip') {
      const binaries = files.filter((f) => f.path && existsSync(f.path))
      if (binaries.length === 0) {
        sendHtml(res, 404, renderErrorPage('没有可打包的文件'))
        return
      }
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDisposition('edge-drop.zip'),
        'Cache-Control': 'no-store'
      })
      // archiver 是纯 ESM。用间接 import 避免被打包器改写成 require()
      const archiverMod = await (new Function('return import("archiver")')() as Promise<{
        default: (format: string, options?: object) => {
          on: (event: string, cb: (err: Error) => void) => void
          pipe: (dest: ServerResponse) => void
          file: (path: string, opts: { name: string }) => void
          finalize: () => Promise<void>
        }
      }>)
      const archive = archiverMod.default('zip', { zlib: { level: 5 } })
      archive.on('error', (err: Error) => {
        console.error('[transfer] zip error:', err)
        try {
          res.destroy(err)
        } catch {
          /* ignore */
        }
      })
      let zipDone = false
      const onZipDone = () => {
        if (zipDone) return
        zipDone = true
        noteOpened(token, 'download', `打包文件 (${binaries.length} 项)`)
      }
      res.on('finish', onZipDone)
      res.on('close', onZipDone)
      archive.pipe(res)
      const usedNames = new Set<string>()
      for (const f of binaries) {
        let name = f.name || basename(f.path!)
        // Avoid duplicate names in zip
        if (usedNames.has(name)) {
          const ext = extname(name)
          const base = basename(name, ext)
          let i = 2
          while (usedNames.has(`${base} (${i})${ext}`)) i++
          name = `${base} (${i})${ext}`
        }
        usedNames.add(name)
        archive.file(f.path!, { name })
      }
      await archive.finalize()
      return
    }

    // Single file by index
    if (action === 'file') {
      if (fileIdx < 0 || fileIdx >= files.length) {
        sendHtml(res, 404, renderErrorPage('文件索引无效'))
        return
      }
      const f = files[fileIdx]
      if (f.text !== undefined) {
        noteOpened(token, 'page')
        sendHtml(res, 200, renderTextPage(f.text, f.name || '文本'))
        return
      }
      if (!f.path) {
        sendHtml(res, 404, renderErrorPage('文件不可用'))
        return
      }
      const name = f.name || basename(f.path)
      streamFile(res, f.path, name, () => noteOpened(token, 'download', name))
      return
    }

    // Root /d/:token
    if (files.length === 1) {
      const f = files[0]
      if (f.text !== undefined) {
        noteOpened(token, 'page')
        sendHtml(res, 200, renderTextPage(f.text, f.name || '文本'))
        return
      }
      if (!f.path) {
        sendHtml(res, 404, renderErrorPage('文件不可用'))
        return
      }
      const name = f.name || basename(f.path)
      streamFile(res, f.path, name, () => noteOpened(token, 'download', name))
      return
    }

    // Multi-file list page
    noteOpened(token, 'page')
    const meta: ListFileMeta[] = files.map((f, index) => ({
      name: f.name || (f.path ? basename(f.path) : '未命名'),
      size: f.size,
      index,
      isText: f.text !== undefined
    }))
    sendHtml(res, 200, renderListPage(token, meta))
  } catch (err) {
    console.error('[transfer] request error:', err)
    if (!res.headersSent) {
      sendHtml(res, 500, renderErrorPage('服务器内部错误'))
    } else {
      res.destroy()
    }
  }
}

function tryListen(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer((req, res) => {
      void handleRequest(req, res)
    })
    s.once('error', (err: NodeJS.ErrnoException) => {
      s.close()
      reject(err)
    })
    s.listen(port, '0.0.0.0', () => {
      server = s
      boundPort = port
      resolve(port)
    })
  })
}

export async function startTransferServer(): Promise<{ port: number; lanIp: string | null }> {
  if (server) {
    return { port: boundPort!, lanIp: getLanIp() }
  }
  cachedLanIp = detectLanIp()
  let lastErr: unknown
  for (let i = 0; i < MAX_PORT_TRIES; i++) {
    const port = START_PORT + i
    try {
      await tryListen(port)
      console.log(`[transfer] listening on 0.0.0.0:${port} (lan=${cachedLanIp ?? 'none'})`)
      return { port, lanIp: cachedLanIp }
    } catch (err) {
      lastErr = err
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EADDRINUSE') throw err
    }
  }
  throw lastErr ?? new Error('无法绑定传输端口')
}

export function stopTransferServer(): void {
  if (!server) return
  try {
    server.close()
  } catch {
    /* ignore */
  }
  server = null
  boundPort = null
}

