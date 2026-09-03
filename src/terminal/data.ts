import type { SiteData } from '../commands/types'

/**
 * Loads /site.json and revives it into the exact shape the command layer
 * expects.
 *
 * JSON has no date type, so every `Date` in SiteData arrives as an ISO string.
 * The commands call `.getUTCMonth()` on those fields, so reviving them is not
 * cosmetic — skip it and `git log` fails at runtime with something unhelpful.
 */

const date = (v: unknown): Date => new Date(v as string)

interface Raw {
  profile: SiteData['profile']
  projects: (Omit<SiteData['projects'][number], 'started'> & { started: string })[]
  roles: (Omit<SiteData['roles'][number], 'start' | 'end'> & { start: string; end: string | null })[]
  now: Omit<SiteData['now'], 'updated'> & { updated: string }
}

let pending: Promise<SiteData> | null = null

export function loadData(): Promise<SiteData> {
  if (pending) return pending

  pending = fetch('/site.json')
    .then((r) => {
      if (!r.ok) throw new Error(`site.json: ${r.status}`)
      return r.json() as Promise<Raw>
    })
    .then((raw) => ({
      profile: raw.profile,
      projects: raw.projects.map((p) => ({ ...p, started: date(p.started) })),
      roles: raw.roles.map((r) => ({
        ...r,
        start: date(r.start),
        end: r.end === null ? null : date(r.end),
      })),
      now: { ...raw.now, updated: date(raw.now.updated) },
    }))
    .catch((err) => {
      // Let the next attempt retry rather than caching a rejection forever.
      pending = null
      throw err
    })

  return pending
}
