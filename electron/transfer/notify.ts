/**
 * Best-effort toast to the renderer from the transfer layer.
 * Kept separate to avoid circular imports between server <-> service.
 */
import { getMainWindow } from '../main/window'

export function transferToast(message: string, tone: 'info' | 'error' = 'info'): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('ui:toast', {
      id: `tf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message,
      tone
    })
  }
}
