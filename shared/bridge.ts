/**
 * Type definition for the preload bridge API surface.
 *
 * Both the preload (implements) and renderer (consumes) import this so the
 * contract lives in one place. The actual implementation lives in the preload;
 * the renderer only ever sees `window.edge` typed as this interface.
 */
import type { Settings } from './types'
import type { DragRequest } from './types'
import type { AnchorOption } from './types'
import type { QrResult, TransferStateDto, TransferTarget } from './types'

export interface EdgeApi {
  /* Renderer -> Main */
  loadState: () => Promise<{ items: import('./types').ClipboardItemDto[]; settings: Settings; version: string }>
  setPinned: (id: string, pinned: boolean) => Promise<import('./types').ClipboardItemDto[]>
  deleteItem: (id: string) => Promise<import('./types').ClipboardItemDto[]>
  clearItems: () => Promise<import('./types').ClipboardItemDto[]>
  removeSubitem: (req: DragRequest) => Promise<boolean>
  copyItem: (id: string) => Promise<boolean>
  copySubitem: (req: DragRequest) => Promise<boolean>
  pasteItem: (id: string) => Promise<boolean>
  pasteSubitem: (req: DragRequest) => Promise<boolean>
  checkUpdate: () => Promise<{ latestVersion: string; downloadUrl: string } | null>
  listAnchorOptions: () => Promise<AnchorOption[]>
  /**
   * Begin a native OS drag-out. Fire-and-forget: must be called synchronously
   * from the DOM `dragstart` event, and main calls `event.sender.startDrag`.
   */
  startDrag: (req: DragRequest) => void
  addFiles: (paths: string[]) => Promise<import('./types').ClipboardItemDto[]>
  addText: (text: string, html?: string) => Promise<import('./types').ClipboardItemDto[]>
  addImageUrl: (url: string) => Promise<import('./types').ClipboardItemDto[]>
  mergeItems: (sourceId: string, targetId: string) => Promise<import('./types').MergeResult>
  splitItem: (req: import('./types').DragRequest) => Promise<boolean>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  setInteractive: (value: boolean) => Promise<void>
  minimizeWindow: () => Promise<void>
  setInternalDrag: (active: boolean) => void
  /** 暂存箱打开时，拖入文件写入暂存箱而非剪贴板历史。 */
  setTransferDropTarget: (active: boolean) => void
  broadcastTutorialStep: (step: number) => void

  /* 局域网传到手机 */
  transferList: () => Promise<TransferStateDto>
  transferStageFile: (paths: string[]) => Promise<TransferStateDto>
  transferStageItem: (itemId: string) => Promise<TransferStateDto>
  transferStageClipboard: () => Promise<TransferStateDto>
  transferRemoveItem: (bundleId: string, itemId: string) => Promise<TransferStateDto>
  transferRemoveBundle: (bundleId: string) => Promise<TransferStateDto>
  transferGenerateQr: (target: TransferTarget) => Promise<QrResult>
  transferRevokeQr: (token: string) => Promise<boolean>
  transferPickFiles: () => Promise<string[]>
  transferSetLanIp: (ip: string | null) => Promise<TransferStateDto>

  /* Main -> Renderer */
  onItems: (cb: (items: import('./types').ClipboardItemDto[]) => void) => () => void
  onSettings: (cb: (settings: Settings) => void) => () => void
  onToggle: (cb: (open?: boolean) => void) => () => void
  onOpenSettings: (cb: () => void) => () => void
  onDragEnd: (cb: () => void) => () => void
  onInternalDrop: (cb: (pos: { x: number; y: number }) => void) => () => void
  onCursorEdge: (cb: (data: { x: number; y: number; inEdge: boolean; inZone: boolean }) => void) => () => void
  onToast: (cb: (toast: { id: string; message: string; tone: 'info' | 'error' }) => void) => () => void
  onTutorialStep: (cb: (step: number) => void) => () => void
  onTransferState: (cb: (state: TransferStateDto) => void) => () => void
}
