/**
 * Preload bridge: the only surface the renderer has onto Electron.
 *
 * Everything is built from the typed contracts in `shared/ipc.ts`, so the
 * renderer gets a fully typed `window.edge` API and never touches a raw channel
 * name. contextIsolation keeps this isolated from page globals; nodeIntegration
 * stays off, so the renderer has no Node access at all.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type {
  EventChannel,
  EventArgs,
  InvokeArgs,
  InvokeChannel,
  InvokeResult,
  SendArgs,
  SendChannel
} from '../../shared/ipc'
import type { EdgeApi } from '../../shared/bridge'
import type { DragRequest } from '../../shared/types'

/** Typed invoke wrapper derived from the shared contracts. */
function invoke<C extends InvokeChannel>(
  channel: C,
  ...args: InvokeArgs<C>
): Promise<InvokeResult<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<C>>
}

/**
 * Typed fire-and-forget send. Used for gestures that the renderer must not
 * await — notably native drag-out, where main needs `event.sender.startDrag`
 * called synchronously relative to the DOM dragstart.
 */
function send<C extends SendChannel>(channel: C, ...args: SendArgs<C>): void {
  ipcRenderer.send(channel, ...args)
}

/** Typed event subscriber. Returns an unsubscribe function. */
function on<C extends EventChannel>(
  channel: C,
  listener: (...args: EventArgs<C>) => void
): () => void {
  const wrapped = (_e: IpcRendererEvent, ...args: EventArgs<C>) => listener(...args)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.off(channel, wrapped)
}

/**
 * Intercept drag-and-drop globally in the preload script.
 * By running in the capturing phase, we intercept the drop before React.
 * This is required because passing DragEvent or File objects across the
 * contextBridge strips their internal C++ backing, causing webUtils.getPathForFile
 * to fail. Handling it here natively bypasses the bridge entirely.
 */
let internalDrag = false
/** When true, file drops go to the transfer staging tray instead of clipboard history. */
let transferDropTarget = false

const win: any = (globalThis as any).window || globalThis

win.addEventListener('dragover', (e: any) => {
  e.preventDefault()
}, false)

win.addEventListener('drop', (e: any) => {
  if (internalDrag) {
    e.preventDefault()
    return
  }

  const files = e.dataTransfer?.files
  if (files && files.length) {
    const paths: string[] = []
    for (let i = 0; i < files.length; i++) {
      try {
        const p = webUtils.getPathForFile(files[i])
        if (p) paths.push(p)
      } catch {
        /* ignore unreadable entries */
      }
    }

    if (paths.length > 0) {
      e.preventDefault()
      if (transferDropTarget) {
        invoke('transfer:stage-file', paths).catch(console.error)
      } else {
        invoke('item:add-files', paths).catch(console.error)
      }
      return
    }
  }

  // No file paths (e.g. a text selection or an image dragged from a browser).
  // Detect an image URL first (from the HTML <img src> or a uri-list), otherwise
  // fall back to capturing the text payload so dropped text is saved like a copy.
  const dt = e.dataTransfer
  if (dt) {
    const html = typeof dt.getData === 'function' ? dt.getData('text/html') : ''
    const text = typeof dt.getData === 'function' ? dt.getData('text/plain') : ''
    const uriList = typeof dt.getData === 'function' ? dt.getData('text/uri-list') : ''

    const imageUrl = pickImageUrl(html, uriList, text)
    if (imageUrl) {
      e.preventDefault()
      invoke('item:add-image-url', imageUrl).catch(console.error)
      return
    }

    if (text && text.trim()) {
      e.preventDefault()
      invoke('item:add-text', text, html || undefined).catch(console.error)
    }
  }
}, true)

const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?|jfif|pjpeg|pjp)(?:[?#]|$)/i

function isImageUrl(u: string): boolean {
  return /^data:image\//i.test(u) || IMG_EXT_RE.test(u)
}

/** Normalize a src that came from an <img> tag into a fetchable absolute URL. */
function absolutifyImgSrc(src: string): string | null {
  const s = src.trim()
  if (!s) return null
  if (/^data:/i.test(s)) return s
  if (/^https?:\/\//i.test(s)) return s
  if (/^\/\//.test(s)) return 'https:' + s
  // relative paths can't be resolved without the page base URL — skip them
  return null
}

/** Extract the best image URL candidate from a browser drag payload, if any. */
function pickImageUrl(html: string, uriList: string, text: string): string | null {
  // The strongest signal: an <img> tag in the HTML payload. If present, trust
  // it's an image regardless of the URL extension (CDN/dynamic URLs often have
  // no .png/.jpg suffix), since the source is literally an <img> element.
  if (html) {
    const m = html.match(/<img[^>]*\bsrc=["']([^"']+)["']/i)
    if (m && m[1]) {
      const abs = absolutifyImgSrc(m[1].replace(/&amp;/gi, '&'))
      if (abs) return abs
    }
  }
  // Without an <img> tag, only treat uri-list / plain-text as an image when the
  // URL clearly looks like one (so dragging a normal hyperlink stays text).
  if (uriList) {
    const first = uriList.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]
    if (first && isImageUrl(first)) return first
  }
  if (text) {
    const t = text.trim()
    if (isImageUrl(t) && /^(https?:|data:)/i.test(t)) return t
  }
  return null
}

const api = {
  /* Renderer -> Main */
  loadState: () => invoke('state:load'),
  setPinned: (id: string, pinned: boolean) => invoke('item:set-pinned', id, pinned),
  deleteItem: (id: string) => invoke('item:delete', id),
  clearItems: () => invoke('item:clear'),
  copyItem: (id: string) => invoke('item:copy', id),
  copySubitem: (req: import('../../shared/types').DragRequest) => invoke('item:copy-subitem', req),
  pasteItem: (id: string) => invoke('item:paste', id),
  pasteSubitem: (req: import('../../shared/types').DragRequest) => invoke('item:paste-subitem', req),
  checkUpdate: () => invoke('app:check-update'),
  listAnchorOptions: () => invoke('displays:list-anchors'),
  startDrag: (req: DragRequest) => send('item:start-drag', req),
  addFiles: (paths: string[]) => invoke('item:add-files', paths),
  addText: (text: string, html?: string) => invoke('item:add-text', text, html),
  addImageUrl: (url: string) => invoke('item:add-image-url', url),
  removeSubitem: (req: import('../../shared/types').DragRequest) => invoke('item:remove-subitem', req),
  mergeItems: (sourceId: string, targetId: string) => invoke('item:merge', sourceId, targetId),
  splitItem: (req: import('../../shared/types').DragRequest) => invoke('item:split', req),
  updateSettings: (patch: Partial<InvokeResult<'settings:update'>>) =>
    invoke('settings:update', patch),
  setInteractive: (value: boolean) => invoke('window:set-interactive', value),
  minimizeWindow: () => invoke('window:minimize'),
  setInternalDrag: (active: boolean) => { internalDrag = active },
  setTransferDropTarget: (active: boolean) => { transferDropTarget = active },
  broadcastTutorialStep: (step: number) => send('tutorial:set-step', step),

  /* 局域网传到手机 */
  transferList: () => invoke('transfer:list'),
  transferStageFile: (paths: string[]) => invoke('transfer:stage-file', paths),
  transferStageItem: (itemId: string) => invoke('transfer:stage-item', itemId),
  transferStageClipboard: () => invoke('transfer:stage-clipboard'),
  transferRemoveItem: (bundleId: string, itemId: string) =>
    invoke('transfer:remove-item', bundleId, itemId),
  transferRemoveBundle: (bundleId: string) => invoke('transfer:remove-bundle', bundleId),
  transferGenerateQr: (target: import('../../shared/types').TransferTarget) =>
    invoke('transfer:generate-qr', target),
  transferRevokeQr: (token: string) => invoke('transfer:revoke-qr', token),
  transferPickFiles: () => invoke('transfer:pick-files'),
  transferSetLanIp: (ip: string | null) => invoke('transfer:set-lan-ip', ip),

  /* Main -> Renderer */
  onItems: (cb: (items: EventArgs<'state:items'>[0]) => void) => on('state:items', cb),
  onSettings: (cb: (settings: EventArgs<'state:settings'>[0]) => void) => on('state:settings', cb),
  onToggle: (cb: (open?: boolean) => void) => on('window:toggle', cb),
  onOpenSettings: (cb: () => void) => on('window:open-settings', cb),
  onDragEnd: (cb: () => void) => on('item:drag-end', cb),
  onInternalDrop: (cb: (pos: { x: number; y: number }) => void) => on('item:internal-drop', cb),
  onCursorEdge: (cb: (data: { x: number; y: number; inEdge: boolean; inZone: boolean }) => void) => on('window:cursor-edge', cb),
  onToast: (cb: (toast: { id: string; message: string; tone: 'info' | 'error' }) => void) => on('ui:toast', cb),
  onTutorialStep: (cb: (step: number) => void) => on('tutorial:step', cb),
  onTransferState: (cb: (state: EventArgs<'transfer:state'>[0]) => void) => on('transfer:state', cb),

  /* Drag helpers */
  // (Handled natively by capturing drop event above)
}

// Validate that our implementation matches the shared contract.
const _bridge: EdgeApi = api
void _bridge

contextBridge.exposeInMainWorld('edge', api)
