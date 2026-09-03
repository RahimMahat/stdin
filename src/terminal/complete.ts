import { canonical, registry } from '../commands'
import type { SiteData } from '../commands/types'

/**
 * Completion over a closed candidate set.
 *
 * The plan called for uFuzzy here. There are thirteen candidates. Shipping five
 * kilobytes of general-purpose fuzzy matching to rank thirteen strings would
 * cost more than the whole rest of this bundle, so the matcher is inline:
 * prefix beats word-boundary beats subsequence, ties broken by how tightly the
 * match clusters. That is the entire algorithm and it is enough at this size.
 */

export interface Suggestion {
  /** What gets inserted into the input. */
  value: string
  /** Right-hand description, shown dimmed. */
  label: string
  /** Indices in `value` that matched, for highlighting. */
  hits: number[]
}

interface Candidate {
  value: string
  label: string
}

/** Everything the shell will accept, in the order it should be offered. */
export function candidates(data: SiteData | null): Candidate[] {
  const out: Candidate[] = []

  for (const c of registry) {
    if (c.name === 'cat') continue // expanded per project below
    out.push({ value: canonical(c), label: c.summary })
  }

  for (const p of data?.projects ?? []) {
    out.push({ value: `cat projects/${p.slug}`, label: p.summary })
  }

  out.push(
    { value: 'theme dark', label: 'deep slate — the default' },
    { value: 'theme light', label: 'warm paper' },
  )

  return out
}

/**
 * Returns match positions, or null if `q` is not a subsequence of `text`.
 * Case-insensitive; `q` is assumed already lowercased.
 */
function match(text: string, q: string): number[] | null {
  const lower = text.toLowerCase()
  const hits: number[] = []
  let at = 0

  for (const ch of q) {
    const found = lower.indexOf(ch, at)
    if (found === -1) return null
    hits.push(found)
    at = found + 1
  }

  return hits
}

function score(text: string, q: string, hits: number[]): number {
  const lower = text.toLowerCase()
  let s = 0

  if (lower.startsWith(q)) s += 1000
  else if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(lower)) s += 500

  // A tight match is a better match: "th" should prefer `theme` over
  // `cat projects/the-one-that-failed`, where the same letters are pages apart.
  const spread = hits[hits.length - 1] - hits[0] - (hits.length - 1)
  s -= spread * 4
  s -= hits[0] * 2
  s -= text.length

  return s
}

export function suggest(input: string, data: SiteData | null, limit = 8): Suggestion[] {
  const q = input.trim().toLowerCase()
  const all = candidates(data)

  if (!q) return all.slice(0, limit).map((c) => ({ ...c, hits: [] }))

  const scored: { c: Candidate; hits: number[]; s: number }[] = []
  for (const c of all) {
    const hits = match(c.value, q)
    if (hits) scored.push({ c, hits, s: score(c.value, q, hits) })
  }

  scored.sort((a, b) => b.s - a.s)
  return scored.slice(0, limit).map(({ c, hits }) => ({ value: c.value, label: c.label, hits }))
}

/**
 * The longest prefix every candidate agrees on — what a shell inserts when tab
 * is ambiguous. Returns null when it would not extend what is already typed.
 */
export function commonPrefix(items: Suggestion[], typed: string): string | null {
  if (items.length === 0) return null

  let prefix = items[0].value
  for (const it of items.slice(1)) {
    let i = 0
    while (i < prefix.length && i < it.value.length && prefix[i].toLowerCase() === it.value[i].toLowerCase()) i++
    prefix = prefix.slice(0, i)
  }

  return prefix.length > typed.length ? prefix : null
}
