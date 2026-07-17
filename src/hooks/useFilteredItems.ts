/**
 * useFilteredItems — derives the visible, grouped item list from raw state.
 *
 * Split into Pinned (favorites) and Recent (everything else), then apply the
 * search query. Kept as a selector so components stay presentational.
 */
import { useMemo } from 'react'
import { useStore } from '../store/appStore'
import type { KindFilter } from '../store/appStore'
import type { ClipboardItemDto } from '../../shared/types'
import { basename } from '../lib/format'

function matches(it: ClipboardItemDto, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  switch (it.data.kind) {
    case 'text':
      return it.data.text.toLowerCase().includes(needle)
    case 'files':
      return it.data.paths.some((p) => basename(p).toLowerCase().includes(needle))
    case 'image':
      // images have no searchable text; hidden by query
      return false
    case 'image-collection':
      // image collections have no searchable text; hidden by query
      return false
  }
}

/** True if the item belongs to the selected category. `image` covers both single images and collections. */
function matchesKind(it: ClipboardItemDto, k: KindFilter): boolean {
  if (k === 'all') return true
  if (k === 'text') return it.data.kind === 'text'
  if (k === 'image') return it.data.kind === 'image' || it.data.kind === 'image-collection'
  return it.data.kind === 'files'
}

export interface GroupedItems {
  pinned: ClipboardItemDto[]
  recent: ClipboardItemDto[]
}

export function useFilteredItems(): GroupedItems {
  const items = useStore((s) => s.items)
  const query = useStore((s) => s.query)
  const kindFilter = useStore((s) => s.kindFilter)
  const tutorialStep = useStore((s) => s.tutorialStep)

  return useMemo(() => {
    const pinned: ClipboardItemDto[] = []
    const recent: ClipboardItemDto[] = []

    const filteredByTutorial = items.filter((it) => {
      if (tutorialStep <= 0) return true
      switch (tutorialStep) {
        case 1:
          return it.id === 'onboarding-welcome'
        case 2:
          return false
        case 3:
          return it.id === 'onboarding-image' || !it.id.startsWith('onboarding-')
        case 4:
          return it.id === 'onboarding-files'
        case 5:
          return true
        default:
          return true
      }
    })

    for (const it of filteredByTutorial) {
      if (!matchesKind(it, kindFilter)) continue
      if (!matches(it, query.trim())) continue
      ;(it.pinned ? pinned : recent).push(it)
    }
    return { pinned, recent }
  }, [items, query, kindFilter, tutorialStep])
}
