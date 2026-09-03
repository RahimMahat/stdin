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

  const nowEntry = nowEntries[0]
  if (!nowEntry) throw new Error('src/content/now/ is empty — the `now` command has nothing to print.')
  if (nowEntries.length > 1) {
    throw new Error('src/content/now/ holds more than one entry. There is only one now.')
  }
  const now: NowData = { ...nowEntry.data, body: md(nowEntry.body ?? '') }

  const profile = { ...rawProfile, bio: md(rawProfile.bio) }

  cached = { profile, projects, roles, now }
  return cached
}
