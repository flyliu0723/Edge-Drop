/**
 * useEdgeHover — the heart of the "invisible until you approach the edge" feel.
 *
 * Supports left- and right-anchored panels (phase 1 multi-monitor).
 */
import { useEffect, useRef } from 'react'
import { edge } from '../lib/edge'
import { useStore } from '../store/appStore'
import type { AnchorEdge } from '../../shared/types'

const TRIGGER_PX = 3
const DWELL_MS = 120
const GRACE_MS = 250
const PANEL_WIDE = 270
const KEEP_INSET = 15
const CLOSE_OUTSET = 20

export const PANEL_LEAVE_EVENT = 'panel:leave'
export const PANEL_ENTER_EVENT = 'panel:enter'

/** True when the in-progress drag carries something we can capture (files or text). */
function hasDragPayload(e: DragEvent): boolean {
  const types = e.dataTransfer?.types
  if (!types) return false
  for (const t of types) {
    if (t === 'Files' || t === 'text/plain' || t === 'text/html' || t === 'text/uri-list') return true
  }
  return false
}

function triggerPx(hotZoneWidth: number): number {
  return Math.max(TRIGGER_PX, hotZoneWidth)
}

function isAtHotEdge(x: number, windowWidth: number, edgeSide: AnchorEdge, hotZoneWidth: number): boolean {
  const trigger = triggerPx(hotZoneWidth)
  if (edgeSide === 'right') {
    return x >= windowWidth - trigger
  }
  return x <= trigger
}

function isInsideBladeX(x: number, windowWidth: number, edgeSide: AnchorEdge): boolean {
  if (edgeSide === 'right') {
    return x >= windowWidth - PANEL_WIDE && x <= windowWidth
  }
  return x >= 0 && x <= PANEL_WIDE
}

function shouldKeepOpen(x: number, windowWidth: number, edgeSide: AnchorEdge): boolean {
  if (edgeSide === 'right') {
    return x >= windowWidth - PANEL_WIDE + KEEP_INSET
  }
  return x <= PANEL_WIDE - KEEP_INSET
}

function shouldStartClose(x: number, windowWidth: number, edgeSide: AnchorEdge): boolean {
  if (edgeSide === 'right') {
    return x < windowWidth - PANEL_WIDE - CLOSE_OUTSET
  }
  return x > PANEL_WIDE + CLOSE_OUTSET
}

export function useEdgeHover(): void {
  const open = useStore((s) => s.open)
  const setOpen = useStore((s) => s.setOpen)
  const settings = useStore((s) => s.settings)
  const dragActive = useStore((s) => s.dragActive)
  const setDragActive = useStore((s) => s.setDragActive)
  const internalDragReq = useStore((s) => s.internalDragReq)

  const openRef = useRef(open)
  openRef.current = open

  const dragActiveRef = useRef(dragActive)
  dragActiveRef.current = dragActive

  const internalDragRef = useRef(!!internalDragReq)
  internalDragRef.current = !!internalDragReq

  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const lastSetInteractiveRef = useRef(0)
  const zone = useRef({ top: 0, bottom: 0, midY: 0, panelHalfH: 0 })
  const lastClient = useRef({ x: -1, y: -1 })

  useEffect(() => {
    const recompute = () => {
      const h = window.innerHeight
      const s = settingsRef.current
      const half = h * s.hotZoneHeight / 2
      const panelHalfH = h * (s.panelHeight || 0.5) / 2
      zone.current = {
        top: h / 2 - half,
        bottom: h / 2 + half,
        midY: h / 2,
        panelHalfH
      }
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [settings.hotZoneHeight, settings.panelHeight, settings.anchorEdge])

  useEffect(() => {
    let dwellTimer: number | undefined
    let graceTimer: number | undefined
    let interactiveTimer: number | undefined

    const closePanel = () => {
      if (!openRef.current) return
      if (dragActiveRef.current && !internalDragRef.current) return
      setOpen(false)
      if (interactiveTimer !== undefined) window.clearTimeout(interactiveTimer)
      interactiveTimer = window.setTimeout(() => {
        interactiveTimer = undefined
        if (!openRef.current) {
          edge.setInteractive(false)
        }
      }, 180)
    }

    const scheduleClose = (delay = GRACE_MS) => {
      if (dragActiveRef.current && !internalDragRef.current) return
      if (graceTimer !== undefined) return
      graceTimer = window.setTimeout(closePanel, delay)
    }

    const cancelClose = () => {
      if (graceTimer !== undefined) {
        window.clearTimeout(graceTimer)
        graceTimer = undefined
      }
      if (interactiveTimer !== undefined) {
        window.clearTimeout(interactiveTimer)
        interactiveTimer = undefined
      }
    }

    const openPanel = () => {
      cancelClose()
      if (dwellTimer !== undefined) {
        window.clearTimeout(dwellTimer)
        dwellTimer = undefined
      }
      if (interactiveTimer !== undefined) {
        window.clearTimeout(interactiveTimer)
        interactiveTimer = undefined
      }
      edge.setInteractive(true)
      if (openRef.current) return
      setOpen(true)
    }

    const isInsideBlade = () => {
      const { midY, panelHalfH } = zone.current
      const { x, y } = lastClient.current
      const edgeSide = settingsRef.current.anchorEdge || 'left'
      const windowWidth = window.innerWidth
      if (x < 0) return true
      return isInsideBladeX(x, windowWidth, edgeSide) && y >= midY - panelHalfH && y <= midY + panelHalfH
    }

    const onPanelLeave = () => {
      if (isInsideBlade()) {
        cancelClose()
        return
      }
      scheduleClose()
    }

    const onPanelEnter = () => {
      cancelClose()
    }

    const unsubCursorEdge = window.edge.onCursorEdge((data) => {
      lastClient.current = { x: data.x, y: data.y }
      const { top, bottom, midY, panelHalfH } = zone.current
      const s = settingsRef.current
      const edgeSide = s.anchorEdge || 'left'
      const windowWidth = window.innerWidth
      const inEdge = isAtHotEdge(data.x, windowWidth, edgeSide, s.hotZoneWidth)
      const inZone = data.y >= top && data.y <= bottom

      if (inEdge && inZone && !openRef.current) {
        cancelClose()
        if (dwellTimer === undefined) {
          dwellTimer = window.setTimeout(() => {
            dwellTimer = undefined
            openPanel()
          }, DWELL_MS)
        }
        return
      }

      if (dwellTimer !== undefined) {
        window.clearTimeout(dwellTimer)
        dwellTimer = undefined
      }

      if (!openRef.current) return

      const now = Date.now()
      if (now - lastSetInteractiveRef.current > 2000) {
        lastSetInteractiveRef.current = now
        edge.setInteractive(true)
      }

      const insideY = data.y >= midY - panelHalfH && data.y <= midY + panelHalfH

      if (shouldKeepOpen(data.x, windowWidth, edgeSide) && insideY) {
        cancelClose()
        return
      }

      if (shouldStartClose(data.x, windowWidth, edgeSide) || !insideY) {
        scheduleClose()
      }
    })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openRef.current) scheduleClose(0)
    }

    const onDocDragEnter = (e: DragEvent) => {
      if (hasDragPayload(e)) {
        e.preventDefault()
        setDragActive(true)
        openPanel()
      }
    }
    const onDocDragOver = (e: DragEvent) => {
      if (hasDragPayload(e)) {
        e.preventDefault()
        cancelClose()
      }
    }
    const onDocDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) {
        setDragActive(false)
        if (internalDragRef.current) scheduleClose(0)
      }
    }
    const onDocDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragActive(false)
    }
    const onDocDragEnd = (e: DragEvent) => {
      e.preventDefault()
      setDragActive(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(PANEL_LEAVE_EVENT, onPanelLeave)
    window.addEventListener(PANEL_ENTER_EVENT, onPanelEnter)
    document.addEventListener('dragenter', onDocDragEnter)
    document.addEventListener('dragover', onDocDragOver)
    document.addEventListener('dragleave', onDocDragLeave)
    document.addEventListener('drop', onDocDrop)
    document.addEventListener('dragend', onDocDragEnd)

    return () => {
      unsubCursorEdge()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(PANEL_LEAVE_EVENT, onPanelLeave)
      window.removeEventListener(PANEL_ENTER_EVENT, onPanelEnter)
      document.removeEventListener('dragenter', onDocDragEnter)
      document.removeEventListener('dragover', onDocDragOver)
      document.removeEventListener('dragleave', onDocDragLeave)
      document.removeEventListener('drop', onDocDrop)
      document.removeEventListener('dragend', onDocDragEnd)
      window.clearTimeout(dwellTimer)
      window.clearTimeout(graceTimer)
      window.clearTimeout(interactiveTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setOpen, setDragActive])
}
