import { getCollection } from 'astro:content'
import { marked } from 'marked'
import type { NowData, Project, Role, SiteData } from '../commands/types'
import { profile as rawProfile } from './profile'

/**
 * Loads and normalises every collection into the plain shapes the command layer
 * consumes. Commands never import from `astro:content` — that keeps them
 * runnable in the phase-2 browser bundle without dragging the content layer in.
 *
 * Markdown is resolved to HTML *here*, not in the renderers. Both the build-time
 * renderer and the live one receive prose that is already HTML, which is the
 * reason the browser never has to ship a markdown parser.
 */

const md = (s: string): string => marked.parse(s, { async: false }).trim()

const DAY = 86_400_000
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/**
 * Replaces `{name}` in hand-written prose with a number computed from the
 * collections, spelled as a word because the prose spells them. `{Name}`
 * capitalises it, for the start of a sentence. The `now` paragraph said "three
 * projects" for a week after there were four; a count typed into prose is a
 * count nobody updates. An unknown token fails the build rather than shipping
 * its braces.
 */
function filler(facts: Record<string, number>) {
  return (s: string): string =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => {
      const n = facts[k.toLowerCase()]
      if (n === undefined) throw new Error(`{${k}} in prose names no fact. Known: ${Object.keys(facts).join(', ')}.`)
      const w = WORDS[n] ?? String(n)
      return k[0] === k[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w
    })
}

let cached: SiteData | null = null

export async function loadSite(): Promise<SiteData> {
  if (cached) return cached

  const projectEntries = await getCollection('projects')
  const roleEntries = await getCollection('roles')
  const nowEntries = await getCollection('now')

  const projects: Project[] = projectEntries
    .map((e) => ({
      ...e.data,
      // The size column reports the write-up as written, in markdown. Measuring
      // the generated HTML instead would inflate every number by half.
      size: (e.body ?? '').length,
      body: md(e.body ?? ''),
      broke: md(e.data.broke),
      fixed: md(e.data.fixed),
    }))
    .sort((a, b) => a.order - b.order)

  const failedCount = projects.filter((p) => p.failed).length
  if (failedCount > 1) {
    throw new Error(
      `${failedCount} projects are marked failed:true. The honest-failure node only works if there is exactly one.`,
    )
  }

  const roles: Role[] = roleEntries
    .map((e) => ({ id: e.id, ...e.data, body: md(e.body ?? '') }))
    // git log order: newest first.
    .sort((a, b) => b.start.getTime() - a.start.getTime())

  const facts = {
    personal: projects.filter((p) => p.kind === 'personal').length,
    // Whole years since the first role began, as of the build. The `now`
    // staleness rule guarantees a build at least every 90 days, so this is
    // never more than a season behind.
    years: Math.floor((Date.now() - Math.min(...roles.map((r) => r.start.getTime()))) / (365.25 * DAY)),
  }
  const fill = filler(facts)

  const nowEntry = nowEntries[0]
  if (!nowEntry) throw new Error('src/content/now/ is empty — the `now` command has nothing to print.')
  if (nowEntries.length > 1) {
    throw new Error('src/content/now/ holds more than one entry. There is only one now.')
  }
  const now: NowData = { ...nowEntry.data, body: md(fill(nowEntry.body ?? '')) }

  const profile = { ...rawProfile, years: `${facts.years}+ yrs`, bio: md(fill(rawProfile.bio)) }

  cached = { profile, projects, roles, now }
  return cached
}
