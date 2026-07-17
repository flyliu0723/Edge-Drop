/**
 * Renderer state store (Zustand).
 *
 * Holds the item list + settings and exposes thin actions that call the bridge
 * and update local state optimistically where it's safe. The main process is
 * always the source of truth; it pushes a fresh DTO list after every mutation,
 * so we mostly just *apply* what it sends us.
 */
import { create } from 'zustand'
import { edge } from '../lib/edge'
import type {
  ClipboardItemDto,
  Settings,
  DragRequest,
  TransferBundleDto,
  TransferStateDto,
  QrResult
} from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

/** Category filter for the shelf. UI-only, not persisted. */
export type KindFilter = 'all' | 'text' | 'image' | 'files'

function isVersionLower(current: string, latest: string): boolean {
  const parse = (v: string) => {
    return v
      .replace(/^v/i, '')
      .split('.')
      .map((part) => parseInt(part, 10) || 0)
  }
  const currParts = parse(current)
  const latParts = parse(latest)
  for (let i = 0; i < Math.max(currParts.length, latParts.length); i++) {
    const c = currParts[i] ?? 0
    const l = latParts[i] ?? 0
    if (l > c) return true
    if (l < c) return false
  }
  return false
}

/** A transient user-facing notice shown as a toast. */
export interface ToastMsg {
  id: string
  message: string
  tone: 'info' | 'error'
}

interface AppState {
  items: ClipboardItemDto[]
  settings: Settings
  /** True until the first `state:load` resolves. */
  hydrated: boolean
  /** Free-text search filter (UI-only state). */
  query: string
  /** Active category filter (UI-only state). */
  kindFilter: KindFilter
  /** Whether the panel blade is expanded. */
  open: boolean
  /** Settings sheet visibility. */
  settingsOpen: boolean
  /** True while an OS file drag is hovering the panel (prevents premature close). */
  dragActive: boolean
  /** True if the active drag originated from within the app itself. Stores the drag request (which item/sub-item). */
  internalDragReq: import('../../shared/types').DragRequest | null
  /** Active toasts (auto-dismissed after a short delay). */
  toasts: ToastMsg[]
  tutorialStep: number
  currentVersion: string
  updateInfo: { hasUpdate: boolean; latestVersion: string; downloadUrl: string } | null

  /* 局域网传输 */
  transferTrayOpen: boolean
  transferBundles: TransferBundleDto[]
  transferLanIp: string | null
  transferLanIps: string[]
  transferPort: number | null
  transferActiveToken: string | null
  activeQr: QrResult | null

  /* hydration + sync */
  hydrate: () => Promise<void>
  checkUpdate: () => Promise<void>
  setItems: (items: ClipboardItemDto[]) => void
  setSettings: (next: Settings) => void
  setTransferState: (state: TransferStateDto) => void

  /* UI */
  setQuery: (q: string) => void
  setKindFilter: (k: KindFilter) => void
  setOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setDragActive: (active: boolean) => void
  setInternalDragReq: (req: import('../../shared/types').DragRequest | null) => void
  setTransferTrayOpen: (open: boolean) => void
  setActiveQr: (qr: QrResult | null) => void
  /** 关闭二维码弹层并作废 token。 */
  dismissQr: () => Promise<void>

  /* toasts */
  pushToast: (toast: ToastMsg) => void
  dismissToast: (id: string) => void

  /* mutations (delegate to main) */
  togglePin: (id: string, pinned: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  clear: () => Promise<void>
  copy: (id: string) => Promise<void>
  paste: (id: string) => Promise<void>
  pasteSubitem: (req: DragRequest) => Promise<void>
  patchSettings: (patch: Partial<Settings>) => Promise<void>
  setTutorialStep: (step: number) => void
  sendToPhone: (id: string) => Promise<void>
  /** 把历史项加入暂存箱。 */
  stageToTray: (id: string) => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  items: [],
  settings: { ...DEFAULT_SETTINGS },
  hydrated: false,
  query: '',
  kindFilter: 'all',
  open: false,
  settingsOpen: false,
  dragActive: false,
  internalDragReq: null,
  toasts: [],
  tutorialStep: 0,
  currentVersion: '',
  updateInfo: null,

  transferTrayOpen: false,
  transferBundles: [],
  transferLanIp: null,
  transferLanIps: [],
  transferPort: null,
  transferActiveToken: null,
  activeQr: null,

  async hydrate() {
    const { items, settings, version } = await edge.loadState()
    set({
      items,
      settings,
      currentVersion: version,
      hydrated: true
    })
    try {
      const tf = await edge.transferList()
      set({
        transferBundles: tf.bundles,
        transferLanIp: tf.lanIp,
        transferLanIps: tf.lanIps ?? [],
        transferPort: tf.port,
        transferActiveToken: tf.activeToken
      })
    } catch (e) {
      console.error('transfer list failed:', e)
    }
    get().checkUpdate().catch(console.error)
  },

  async checkUpdate() {
    const current = get().currentVersion
    if (!current) return
    try {
      const res = await edge.checkUpdate()
      if (res) {
        const hasUpdate = isVersionLower(current, res.latestVersion)
        set({
          updateInfo: {
            hasUpdate,
            latestVersion: res.latestVersion,
            downloadUrl: res.downloadUrl
          }
        })
      }
    } catch (e) {
      console.error('Update check failed:', e)
    }
  },

  setItems: (items) => set({ items }),
  setSettings: (next) => set({ settings: next }),
  setTransferState: (state) =>
    set({
      transferBundles: state.bundles,
      transferLanIp: state.lanIp,
      transferLanIps: state.lanIps ?? [],
      transferPort: state.port,
      transferActiveToken: state.activeToken
    }),

  setQuery: (query) => set({ query }),
  setKindFilter: (kindFilter) => set({ kindFilter }),
  setOpen: (open) => set({ open }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setDragActive: (dragActive) => set({ dragActive }),
  setTransferTrayOpen: (transferTrayOpen) => {
    set({ transferTrayOpen })
    edge.setTransferDropTarget(transferTrayOpen)
  },
  setActiveQr: (activeQr) => set({ activeQr }),

  async dismissQr() {
    const qr = get().activeQr
    const token = qr?.token ?? get().transferActiveToken
    set({ activeQr: null })
    if (token) {
      try {
        await edge.transferRevokeQr(token)
      } catch {
        /* ignore */
      }
    }
  },

  setInternalDragReq: (internalDragReq) => {
    if (internalDragReq === null) {
      set({ internalDragReq: null, dragActive: false })
    } else {
      set({ internalDragReq })
    }
    edge.setInternalDrag(!!internalDragReq)
  },

  pushToast: (toast) => {
    set({ toasts: [...get().toasts, toast] })
    // Auto-dismiss after 2.6s. Errors linger slightly longer for readability.
    const ttl = toast.tone === 'error' ? 3400 : 2600
    window.setTimeout(() => get().dismissToast(toast.id), ttl)
  },

  dismissToast: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },

  async togglePin(id, pinned) {
    // Optimistic: flip locally, then let the pushed list confirm.
    set({
      items: get().items.map((it) => (it.id === id ? { ...it, pinned } : it))
    })
    const items = await edge.setPinned(id, pinned)
    set({ items })
  },

  async remove(id) {
    set({ items: get().items.filter((it) => it.id !== id) })
    const items = await edge.deleteItem(id)
    set({ items })
  },

  async clear() {
    const items = await edge.clearItems()
    set({ items })
  },

  async copy(id) {
    await edge.copyItem(id)
  },

  async paste(id) {
    await edge.pasteItem(id)
  },

  async pasteSubitem(req) {
    await edge.pasteSubitem(req)
  },

  async patchSettings(patch) {
    const next = await edge.updateSettings(patch)
    set({ settings: next })
  },

  setTutorialStep: (step) => {
    set({ tutorialStep: step })
    edge.broadcastTutorialStep(step)
  },

  async sendToPhone(id) {
    try {
      const qr = await edge.transferGenerateQr({ kind: 'item', id })
      set({ activeQr: qr })
    } catch (e) {
      get().pushToast({
        id: `send-${Date.now()}`,
        message: (e as Error).message || '生成二维码失败',
        tone: 'error'
      })
    }
  },

  async stageToTray(id) {
    try {
      const state = await edge.transferStageItem(id)
      set({
        transferBundles: state.bundles,
        transferLanIp: state.lanIp,
        transferLanIps: state.lanIps ?? [],
        transferPort: state.port,
        transferActiveToken: state.activeToken,
        transferTrayOpen: true
      })
      edge.setTransferDropTarget(true)
      get().pushToast({
        id: `stage-${Date.now()}`,
        message: '已加入暂存箱',
        tone: 'info'
      })
    } catch (e) {
      get().pushToast({
        id: `stage-${Date.now()}`,
        message: (e as Error).message || '加入暂存箱失败',
        tone: 'error'
      })
    }
  }
}))
