/**
 * The edge panel BrowserWindow.
 *
 * The window is anchored to a user-selected display edge (left or right).
 * It is transparent and frameless, and is normally click-through so the desktop
 * stays fully usable. Edge detection runs in the main-process cursor poll.
 *
 * NOTE: this module must NOT import from state.ts to avoid circular dependencies.
 */
import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { APP_CONFIG } from './config'
import { runtime } from './config'
import { PATHS } from '../store/paths'
import { computePanelBounds, resolveAnchorDisplay } from './displays'
import type { AnchorEdge } from '../../shared/types'

export const PANEL_WIDTH = 384
/** Visual width of the blade when collapsed (only used by the renderer). */
export const COLLAPSED_WIDTH = 0

let mainWindow: BrowserWindow | null = null
let detectorWindow: BrowserWindow | null = null
let interactive = false

export let currentHotZoneWidth = 3
let currentAnchorDisplayId: number | null = null
let currentAnchorEdge: AnchorEdge = 'left'

function ensureAnchorDisplayId(): number {
  if (currentAnchorDisplayId === null) {
    currentAnchorDisplayId = screen.getPrimaryDisplay().id
  }
  return currentAnchorDisplayId
}

export function setHotZoneWidth(width: number): void {
  currentHotZoneWidth = width
}

export function setAnchorConfig(displayId: number, edge: AnchorEdge): void {
  currentAnchorDisplayId = displayId
  currentAnchorEdge = edge
}

export function getAnchorEdge(): AnchorEdge {
  return currentAnchorEdge
}

export function getAnchorDisplayId(): number {
  return ensureAnchorDisplayId()
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/** True when the window currently accepts mouse clicks (blade is "open"). */
export function isInteractive(): boolean {
  return interactive
}

export function setInteractive(value: boolean): void {
  if (!mainWindow || value === interactive) return
  interactive = value
  if (value) {
    mainWindow.setIgnoreMouseEvents(false)
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  } else {
    mainWindow.setIgnoreMouseEvents(true, { forward: false })
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  }
}

let cursorPollTimer: ReturnType<typeof setInterval> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let lastEdgeState = false
let heartbeatPaused = false

export function setHeartbeatPaused(paused: boolean): void {
  heartbeatPaused = paused
  if (!paused) {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
    }
    if (detectorWindow && !detectorWindow.isDestroyed() && detectorWindow.isVisible()) {
      detectorWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  }
}

function edgeGeometry(): { x: number; y: number; width: number; height: number } {
  const display = resolveAnchorDisplay({
    anchorDisplayId: ensureAnchorDisplayId(),
    anchorEdge: currentAnchorEdge
  })
  return computePanelBounds(display, currentAnchorEdge, PANEL_WIDTH)
}

function repositionDetector(g: { x: number; y: number; width: number; height: number }): void {
  if (!detectorWindow || detectorWindow.isDestroyed()) return
  const detHeight = Math.floor(g.height * 0.3)
  const detY = g.y + Math.floor((g.height - detHeight) / 2)
  const detX = currentAnchorEdge === 'right' ? g.x + g.width - 1 : g.x
  detectorWindow.setBounds({ x: detX, y: detY, width: 1, height: detHeight })
}

/** Re-apply bounds after anchor or display layout changes. */
export function applyWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const g = edgeGeometry()
  mainWindow.setBounds({ ...g })
  repositionDetector(g)
}

function cursorOnAnchorDisplay(pt: { x: number; y: number }): boolean {
  const display = resolveAnchorDisplay({
    anchorDisplayId: ensureAnchorDisplayId(),
    anchorEdge: currentAnchorEdge
  })
  const wa = display.workArea
  return pt.x >= wa.x && pt.x < wa.x + wa.width && pt.y >= wa.y && pt.y < wa.y + wa.height
}

function isInHotEdge(clientX: number, windowWidth: number): boolean {
  if (currentAnchorEdge === 'right') {
    return clientX >= windowWidth - currentHotZoneWidth
  }
  return clientX <= currentHotZoneWidth
}

function shouldStreamCursor(clientX: number, windowWidth: number): boolean {
  const nearEdge = currentAnchorEdge === 'right'
    ? clientX >= windowWidth - 450
    : clientX <= 450
  return nearEdge || interactive
}

export function startCursorPoll(): void {
  if (cursorPollTimer !== null) return
  cursorPollTimer = setInterval(() => {
    if (runtime.quitting || !mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return

    const pt = screen.getCursorScreenPoint()
    if (!cursorOnAnchorDisplay(pt)) return

    const bounds = mainWindow.getBounds()
    const clientX = pt.x - bounds.x
    const clientY = pt.y - bounds.y

    if (clientX < -1000 || clientX > 10000 || clientY < -1000 || clientY > 10000) return

    const inEdge = isInHotEdge(clientX, bounds.width)
    const newState = inEdge

    if (shouldStreamCursor(clientX, bounds.width) || newState !== lastEdgeState) {
      lastEdgeState = newState
      if (!mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('window:cursor-edge', {
          x: clientX,
          y: clientY,
          inEdge,
          inZone: true
        })
      }
    }
  }, 16)
}

export function stopCursorPoll(): void {
  if (cursorPollTimer !== null) {
    clearInterval(cursorPollTimer)
    cursorPollTimer = null
  }
}

export function createWindow(): BrowserWindow {
  const g = edgeGeometry()

  mainWindow = new BrowserWindow({
    icon: PATHS.icon(),
    x: g.x,
    y: g.y,
    width: PANEL_WIDTH,
    height: g.height,
    show: false,
    frame: false,
    fullscreenable: false,
    maximizable: false,
    minWidth: PANEL_WIDTH,
    minHeight: 320,
    movable: false,
    resizable: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    backgroundColor: '#00000000',
    roundedCorners: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  mainWindow.setIgnoreMouseEvents(true, { forward: false })

  const onDisplayChange = () => {
    if (!mainWindow?.isVisible()) return
    applyWindowBounds()
  }
  screen.on('display-metrics-changed', onDisplayChange)
  screen.on('display-added', onDisplayChange)
  screen.on('display-removed', onDisplayChange)

  mainWindow.on('focus', () => {
    mainWindow?.setAlwaysOnTop(true, 'screen-saver')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (APP_CONFIG.is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.showInactive()
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  })

  mainWindow.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`)
  })

  mainWindow.on('close', (e) => {
    if (!runtime.quitting) {
      e.preventDefault()
    }
  })

  createDetectorWindow(g)

  if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(() => {
    if (runtime.quitting || heartbeatPaused || interactive) return
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
    }
    if (detectorWindow && !detectorWindow.isDestroyed() && detectorWindow.isVisible()) {
      detectorWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  }, 500)

  return mainWindow
}

export function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

export function setVisible(visible: boolean): void {
  if (!mainWindow) return
  if (visible) {
    mainWindow.showInactive()
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  } else {
    mainWindow.hide()
  }
}

function createDetectorWindow(g: { x: number; y: number; width: number; height: number }): void {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0}
  html,body{width:100%;height:100%;background:transparent;pointer-events:none;overflow:hidden}
</style></head><body>
<script>
  document.addEventListener('dragenter', function(e) {
    if (e.dataTransfer && e.dataTransfer.types.indexOf && e.dataTransfer.types.indexOf('Files') >= 0) {
      e.preventDefault();
      if (window.edge) window.edge.setInteractive(true);
    }
  });
  document.addEventListener('dragover', function(e) {
    if (e.dataTransfer && e.dataTransfer.types.indexOf && e.dataTransfer.types.indexOf('Files') >= 0) {
      e.preventDefault();
    }
  });
  document.addEventListener('drop', function(e) {
    e.preventDefault();
  });
</script>
</body></html>`

  const detHeight = Math.floor(g.height * 0.3)
  const detY = g.y + Math.floor((g.height - detHeight) / 2)
  const detX = currentAnchorEdge === 'right' ? g.x + g.width - 1 : g.x

  detectorWindow = new BrowserWindow({
    x: detX,
    y: detY,
    width: 1,
    height: detHeight,
    show: false,
    frame: false,
    fullscreenable: false,
    maximizable: false,
    movable: false,
    resizable: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    roundedCorners: false,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  detectorWindow.setIgnoreMouseEvents(true, { forward: false })
  detectorWindow.setAlwaysOnTop(true, 'normal')
  detectorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

  detectorWindow.once('ready-to-show', () => {
    detectorWindow?.showInactive()
  })

  detectorWindow.on('close', (e) => {
    if (!runtime.quitting) {
      e.preventDefault()
    }
  })
}
