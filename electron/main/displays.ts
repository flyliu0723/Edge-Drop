/**
 * Multi-monitor anchor helpers.
 *
 * Resolves which display + edge the panel is glued to, and filters out
 * interior seams between adjacent monitors so users only pick real outer edges.
 */
import { screen, type Display } from 'electron'
import type { AnchorEdge, AnchorOption, Settings } from '../../shared/types'

const SEAM_TOLERANCE = 2

export function getEdgeLabel(edge: AnchorEdge): string {
  return edge === 'left' ? '左边缘' : '右边缘'
}

function verticalOverlap(a: Electron.Rectangle, b: Electron.Rectangle): boolean {
  return !(a.y + a.height <= b.y || b.y + b.height <= a.y)
}

/** True when another display shares this outer edge (monitor seam). */
export function isEdgeShared(display: Display, edge: AnchorEdge): boolean {
  const wa = display.workArea
  for (const other of screen.getAllDisplays()) {
    if (other.id === display.id) continue
    const ow = other.workArea

    if (edge === 'left') {
      const seam = Math.abs(ow.x + ow.width - wa.x) <= SEAM_TOLERANCE
      if (seam && verticalOverlap(wa, ow)) return true
    } else {
      const seam = Math.abs(wa.x + wa.width - ow.x) <= SEAM_TOLERANCE
      if (seam && verticalOverlap(wa, ow)) return true
    }
  }
  return false
}

export function isEdgeAvailable(display: Display, edge: AnchorEdge): boolean {
  return !isEdgeShared(display, edge)
}

function displayLabel(display: Display, index: number): string {
  const wa = display.workArea
  const primary = screen.getPrimaryDisplay().id === display.id ? ' · 主屏' : ''
  return `显示器 ${index + 1}（${wa.width}×${wa.height}）${primary}`
}

/** All selectable anchor positions (outer edges only). */
export function listAnchorOptions(): AnchorOption[] {
  const displays = screen.getAllDisplays()
  const options: AnchorOption[] = []

  displays.forEach((display, index) => {
    for (const edge of ['left', 'right'] as AnchorEdge[]) {
      if (!isEdgeAvailable(display, edge)) continue
      options.push({
        displayId: display.id,
        displayLabel: displayLabel(display, index),
        edge,
        edgeLabel: getEdgeLabel(edge)
      })
    }
  })

  return options
}

export function getDisplayById(id: number): Display | null {
  return screen.getAllDisplays().find((d) => d.id === id) ?? null
}

/** Pick a valid display for the current anchor settings. */
export function resolveAnchorDisplay(settings: Pick<Settings, 'anchorDisplayId' | 'anchorEdge'>): Display {
  const options = listAnchorOptions()
  const match = options.find(
    (o) => o.displayId === settings.anchorDisplayId && o.edge === settings.anchorEdge
  )
  if (match) {
    const display = getDisplayById(match.displayId)
    if (display) return display
  }

  const primary = screen.getPrimaryDisplay()
  const primaryLeft = options.find((o) => o.displayId === primary.id && o.edge === 'left')
  if (primaryLeft) {
    const display = getDisplayById(primaryLeft.displayId)
    if (display) return display
  }

  const first = options[0]
  if (first) {
    const display = getDisplayById(first.displayId)
    if (display) return display
  }

  return primary
}

/** Normalize anchor fields so persisted settings always reference a valid option. */
export function normalizeAnchorSettings(settings: Settings): Settings {
  const resolved = resolveAnchorDisplay(settings)
  const options = listAnchorOptions()
  const match =
    options.find((o) => o.displayId === settings.anchorDisplayId && o.edge === settings.anchorEdge) ??
    options.find((o) => o.displayId === resolved.id && o.edge === 'left') ??
    options[0]

  if (!match) {
    return {
      ...settings,
      anchorDisplayId: resolved.id,
      anchorEdge: 'left'
    }
  }

  return {
    ...settings,
    anchorDisplayId: match.displayId,
    anchorEdge: match.edge
  }
}

export function computePanelBounds(
  display: Display,
  edge: AnchorEdge,
  panelWidth: number
): { x: number; y: number; width: number; height: number } {
  const wa = display.workArea
  const height = wa.height
  const y = wa.y

  if (edge === 'right') {
    return {
      x: wa.x + wa.width - panelWidth,
      y,
      width: panelWidth,
      height
    }
  }

  return {
    x: wa.x,
    y,
    width: panelWidth,
    height
  }
}
