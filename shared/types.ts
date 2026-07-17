/**
 * Shared domain types used by both the Electron main process and the renderer.
 *
 * Items are serialized in two places:
 *   - the on-disk index (JSON in userData)
 *   - the IPC payloads sent to the renderer
 * Images are stored as separate PNG files referenced by `imageId`, while the
 * renderer receives the bytes inline as a data URL so the UI never blocks on disk I/O.
 */

/** Maximum number of sub-items that may live in a single stack/bundle. */
export const MAX_STACK = 10

/** Discriminated union describing the payload of a clipboard item. */
export type ItemData =
  | { kind: 'text'; text: string; html?: string; isUrl: boolean; isColor?: boolean }
  | { kind: 'image'; imageId: string; width: number; height: number; bytes: number; ext?: string }
  | { kind: 'image-collection'; images: { imageId: string; width: number; height: number; bytes: number; ext?: string }[] }
  | { kind: 'files'; paths: string[] }

export type ItemKind = ItemData['kind']

/**
 * A single clipboard entry. `id` is stable across the lifetime of the entry;
 * it is used as the React key and the storage key for pinned/persisted items.
 */
export interface ClipboardItem {
  id: string
  data: ItemData
  /** Unix epoch ms of the moment the item was captured. */
  capturedAt: number
  /** Number of times this exact content has been captured. */
  hitCount: number
  /** Pinned items never scroll off and survive app restarts. */
  pinned: boolean
}

/**
 * Display metadata for a single file inside a `files` bundle.
 * Computed by main from the path/extension + a stat() call; the internal
 * `ItemData.files` model stays a plain path list so drag/merge/split logic
 * is untouched, while the renderer gets what it needs to render richly.
 */
export interface FileEntry {
  name: string
  ext: string
  size: number
  isImage: boolean
  preview?: string
}

/** Payload sent over IPC: same as ClipboardItem but with inline image previews. */
export interface ClipboardItemDto extends Omit<ClipboardItem, 'data'> {
  data:
  | { kind: 'text'; text: string; html?: string; isUrl: boolean; isColor?: boolean }
  | { kind: 'image'; imageId: string; width: number; height: number; bytes: number; preview: string; ext?: string }
  | { kind: 'image-collection'; images: { imageId: string; width: number; height: number; bytes: number; preview: string; ext?: string }[] }
  | { kind: 'files'; paths: string[]; previews?: string[]; entries?: FileEntry[] }
}

/** Section the renderer groups items into. */
export type ItemSection = 'pinned' | 'shelf'

/**
 * Request to begin a native OS drag-out of one item.
 *
 * `id` always identifies the source item. `paths` is an optional override that
 * narrows a `files` bundle to a single path (used when dragging one file out of
 * an expanded bundle). When omitted, main uses all of the item's content.
 */
export interface DragRequest {
  id: string
  paths?: string[]
  imageId?: string
  splitPlacement?: 'before' | 'after'
}

/**
 * Outcome of a merge attempt. `reason` tells the renderer *why* it failed so it
 * can show a precise message (e.g. "collection full" vs "can't mix types").
 */
export interface MergeResult {
  ok: boolean
  reason?: 'full' | 'incompatible' | 'notfound'
  message?: string
}

/** Which vertical screen edge the panel anchors to (phase 1: left / right only). */
export type AnchorEdge = 'left' | 'right'

/** One selectable anchor position exposed to the settings UI. */
export interface AnchorOption {
  displayId: number
  displayLabel: string
  edge: AnchorEdge
  edgeLabel: string
}

export interface Settings {
  /** Fraction of the screen height the hot zone occupies (0.2 - 0.6). */
  hotZoneHeight: number
  /** Physical thickness (in pixels) of the screen edge hover trigger. */
  hotZoneWidth: number
  /** Maximum number of unpinned history items kept. */
  historyLimit: number
  /** Fraction of the screen height the panel occupies (0.4 - 1.0). */
  panelHeight: number
  /** When true, newly captured items are not recorded. */
  incognito: boolean
  /** Start minimized when the OS logs in. */
  launchAtLogin: boolean
  /** Reduce motion for the panel animations. */
  reduceMotion: boolean
  /** When true, automatically clears unpinned items on device/app restart. */
  clearUnpinnedOnRestart: boolean
  /** Hours after which unpinned items are automatically purged (0 = Never). */
  autoDeleteHours: number
  /** UI visual style density ('modern' | 'compact'). */
  uiStyle: 'modern' | 'compact'
  /** Flag to track if the onboarding tutorial is completed. */
  tutorialCompleted: boolean
  /** Electron Display.id the panel is anchored to. */
  anchorDisplayId: number
  /** Outer edge of `anchorDisplayId` where hover opens the panel. */
  anchorEdge: AnchorEdge
}

export const DEFAULT_SETTINGS: Settings = {
  hotZoneHeight: 0.25,
  hotZoneWidth: 3,
  historyLimit: 500,
  panelHeight: 0.5,
  incognito: false,
  launchAtLogin: true,
  reduceMotion: false,
  clearUnpinnedOnRestart: false,
  autoDeleteHours: 0,
  uiStyle: 'modern',
  tutorialCompleted: false,
  anchorDisplayId: 0,
  anchorEdge: 'left'
}

/* ------------------------------------------------------------------ */
/* 局域网传到手机                                                      */
/* ------------------------------------------------------------------ */

/** 暂存箱内单项的内容。 */
export type TransferPayload =
  | { kind: 'text'; text: string; name?: string }
  | { kind: 'file'; path: string; name: string; size: number }
  | { kind: 'image'; path: string; name: string; size: number }

export interface TransferItem {
  id: string
  payload: TransferPayload
  addedAt: number
}

/** 一个可生成二维码的传输包（暂存箱条目）。 */
export interface TransferBundle {
  id: string
  /** 内容变更时递增；二维码 token 绑定此版本，变更后旧码失效。 */
  version: number
  items: TransferItem[]
  createdAt: number
  label?: string
}

/** 传给 renderer 的包快照（与内部结构相同，预留扩展）。 */
export type TransferBundleDto = TransferBundle

/** 生成二维码的目标：单条剪贴板历史，或整个暂存箱包。 */
export type TransferTarget =
  | { kind: 'item'; id: string }
  | { kind: 'bundle'; bundleId: string }

export interface QrResult {
  token: string
  url: string
  qrDataUrl: string
  expiresAt: number
  lanIp: string
}

/** Main → Renderer 的传输状态推送。 */
export interface TransferStateDto {
  bundles: TransferBundleDto[]
  activeToken: string | null
  lanIp: string | null
  /** 本机可用的局域网 IPv4 列表（多网卡时可选）。 */
  lanIps: string[]
  port: number | null
}


