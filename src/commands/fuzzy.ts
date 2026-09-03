/**
 * The matcher, shared by tab completion and by the "did you mean" that answers
 * an unknown command.
 *
 * Deliberately dependency-free and importing nothing: both the command layer
 * and the terminal layer need it, and anything it imported would risk a cycle
 * between them.
 *
 * The algorithm is the whole of it — prefix beats word-boundary beats
 * subsequence, ties broken by how tightly the match clusters. At this size
 * (a dozen or so candidates) nothing more elaborate would change an answer.
 */

export interface Candidate {
  value: string
  label: string
}

export interface Hit extends Candidate {
  /** Indices in `value` that matched, for highlighting. */
  hits: number[]
  score: number
}

/**
 * Match positions, or null if `q` is not a subsequence of `text`.
 * `q` is assumed already lowercased.
 */
export function subsequence(text: string, q: string): number[] | null {
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

export function score(text: string, q: string, hits: number[]): number {
  const lower = text.toLowerCase()
  let s = 0

  if (lower.startsWith(q)) s += 1000
  else if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(lower)) s += 500

  // A tight match is a better match: "th" should prefer `theme` over
  // `cat projects/warehouse`, where the same letters are pages apart.
  const spread = hits[hits.length - 1] - hits[0] - (hits.length - 1)
  s -= spread * 4
  s -= hits[0] * 2
  s -= text.length

  return s
}

/** Ranked matches for `q`, best first. */
export function search(candidates: Candidate[], q: string, limit = 8): Hit[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return candidates.slice(0, limit).map((c) => ({ ...c, hits: [], score: 0 }))

  const out: Hit[] = []
  for (const c of candidates) {
    const hits = subsequence(c.value, needle)
    if (hits) out.push({ ...c, hits, score: score(c.value, needle, hits) })
  }

  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}
