/**
 * In-memory staging tray for batch phone transfers.
 *
 * Not persisted across restarts. Content mutations bump `version` so any
 * QR token bound to the previous version returns 410 Gone.
 */
import { basename } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import type { TransferBundle, TransferItem, TransferPayload } from '../../shared/types'
import { createId } from '../store/ids'
import { revokeBundleTokens } from './tokenStore'

const bundles = new Map<string, TransferBundle>()

/** Prefer a single default tray so the UI stays simple. */
const DEFAULT_BUNDLE_ID = 'default'

function ensureDefault(): TransferBundle {
  let b = bundles.get(DEFAULT_BUNDLE_ID)
  if (!b) {
    b = {
      id: DEFAULT_BUNDLE_ID,
      version: 1,
      items: [],
      createdAt: Date.now(),
      label: '暂存箱'
    }
    bundles.set(DEFAULT_BUNDLE_ID, b)
  }
  return b
}

function bump(bundle: TransferBundle): void {
  bundle.version += 1
  revokeBundleTokens(bundle.id)
}

export function listBundles(): TransferBundle[] {
  ensureDefault()
  return Array.from(bundles.values()).map((b) => ({
    ...b,
    items: [...b.items]
  }))
}

export function getBundle(id: string): TransferBundle | undefined {
  return bundles.get(id)
}

export function getDefaultBundleId(): string {
  ensureDefault()
  return DEFAULT_BUNDLE_ID
}

export function stagePayload(payload: TransferPayload, bundleId = DEFAULT_BUNDLE_ID): TransferBundle {
  const bundle = bundleId === DEFAULT_BUNDLE_ID ? ensureDefault() : bundles.get(bundleId)
  if (!bundle) {
    throw new Error(`暂存箱不存在：${bundleId}`)
  }

  // Dedup by path / text
  const dup = bundle.items.find((it) => {
    if (payload.kind === 'text' && it.payload.kind === 'text') {
      return it.payload.text === payload.text
    }
    if (
      (payload.kind === 'file' || payload.kind === 'image') &&
      (it.payload.kind === 'file' || it.payload.kind === 'image')
    ) {
      return it.payload.path === payload.path
    }
    return false
  })
  if (dup) return listBundles().find((b) => b.id === bundle.id)!

  const item: TransferItem = {
    id: createId(),
    payload,
    addedAt: Date.now()
  }
  bundle.items.push(item)
  bump(bundle)
  return listBundles().find((b) => b.id === bundle.id)!
}

export function stageFiles(paths: string[], bundleId = DEFAULT_BUNDLE_ID): TransferBundle {
  for (const p of paths) {
    if (!existsSync(p)) continue
    let size = 0
    try {
      size = statSync(p).size
    } catch {
      /* ignore */
    }
    const name = basename(p)
    const isImg = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?)$/i.test(name)
    stagePayload(
      isImg
        ? { kind: 'image', path: p, name, size }
        : { kind: 'file', path: p, name, size },
      bundleId
    )
  }
  return listBundles().find((b) => b.id === (bundleId || DEFAULT_BUNDLE_ID)) ?? ensureDefault()
}

export function removeItem(bundleId: string, itemId: string): TransferBundle | null {
  const bundle = bundles.get(bundleId)
  if (!bundle) return null
  const before = bundle.items.length
  bundle.items = bundle.items.filter((it) => it.id !== itemId)
  if (bundle.items.length === before) return listBundles().find((b) => b.id === bundleId) ?? null
  bump(bundle)
  if (bundle.items.length === 0 && bundleId !== DEFAULT_BUNDLE_ID) {
    bundles.delete(bundleId)
    return null
  }
  return listBundles().find((b) => b.id === bundleId) ?? null
}

export function removeBundle(bundleId: string): boolean {
  if (bundleId === DEFAULT_BUNDLE_ID) {
    const b = ensureDefault()
    if (b.items.length === 0) return false
    b.items = []
    bump(b)
    return true
  }
  const existed = bundles.delete(bundleId)
  if (existed) revokeBundleTokens(bundleId)
  return existed
}

/**
 * Drop staging items older than `hours`. Returns true if anything changed.
 * hours <= 0 means never prune.
 */
export function pruneExpired(hours: number): boolean {
  if (!hours || hours <= 0) return false
  const cutoff = Date.now() - hours * 3600 * 1000
  let changed = false
  for (const bundle of bundles.values()) {
    const kept = bundle.items.filter((it) => it.addedAt >= cutoff)
    if (kept.length !== bundle.items.length) {
      bundle.items = kept
      bump(bundle)
      changed = true
    }
  }
  return changed
}
