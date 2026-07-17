/**
 * One-shot / short-lived download tokens for phone transfer.
 *
 * - snapshot: immutable payload (single clipboard item) — only TTL expires it
 * - bundle: live lookup by bundleId+version — content change invalidates
 */
import { randomBytes } from 'node:crypto'

export interface SnapshotFile {
  /** Absolute path on disk, or omitted for pure text. */
  path?: string
  /** Inline text content (no file). */
  text?: string
  name: string
  size: number
  mime?: string
}

export type TokenEntry =
  | {
      kind: 'snapshot'
      files: SnapshotFile[]
      expiresAt: number
    }
  | {
      kind: 'bundle'
      bundleId: string
      version: number
      expiresAt: number
    }

const tokens = new Map<string, TokenEntry>()
let activeToken: string | null = null

/** 16-byte base32-ish token (hex is fine and URL-safe). */
export function createToken(): string {
  return randomBytes(16).toString('hex')
}

export function putToken(token: string, entry: TokenEntry, setActive = true): void {
  tokens.set(token, entry)
  if (setActive) activeToken = token
}

export function getToken(token: string): TokenEntry | null {
  const entry = tokens.get(token)
  if (!entry) return null
  if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
    tokens.delete(token)
    if (activeToken === token) activeToken = null
    return null
  }
  return entry
}

export function revokeToken(token: string): boolean {
  const existed = tokens.delete(token)
  if (activeToken === token) activeToken = null
  return existed
}

/** Invalidate every token bound to a bundle (any version). */
export function revokeBundleTokens(bundleId: string): void {
  for (const [tok, entry] of tokens) {
    if (entry.kind === 'bundle' && entry.bundleId === bundleId) {
      tokens.delete(tok)
      if (activeToken === tok) activeToken = null
    }
  }
}

export function getActiveToken(): string | null {
  if (activeToken && !getToken(activeToken)) {
    activeToken = null
  }
  return activeToken
}

export function pruneExpiredTokens(): boolean {
  const now = Date.now()
  let removed = false
  for (const [tok, entry] of tokens) {
    if (entry.expiresAt > 0 && now > entry.expiresAt) {
      tokens.delete(tok)
      if (activeToken === tok) activeToken = null
      removed = true
    }
  }
  return removed
}

export function clearAllTokens(): void {
  tokens.clear()
  activeToken = null
}
