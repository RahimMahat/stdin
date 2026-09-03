const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 2023-03-14 — sortable, unambiguous, what a log would print. */
export const ymd = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

/** Mar 2023 */
export const mon = (d: Date): string => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`

/** Real byte count of the write-up. Nothing here is invented. */
export function bytes(n: number): string {
  if (n < 1024) return `${n}B`
  return `${(n / 1024).toFixed(1)}K`
}

/** 1y 4m — the duration column of a run log. */
export function span(start: Date, end: Date | null): string {
  const to = end ?? new Date()
  let months = (to.getUTCFullYear() - start.getUTCFullYear()) * 12 + (to.getUTCMonth() - start.getUTCMonth())
  if (months < 0) months = 0
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m}m`
  if (m === 0) return `${y}y`
  return `${y}y ${m}m`
}

/**
 * A stable short hash for the git-log metaphor. Deterministic so the same role
 * always prints the same hash across builds — a hash that changed every deploy
 * would give the joke away as decoration.
 */
export function shortHash(seed: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0').slice(0, 7)
}

export function daysAgo(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}
