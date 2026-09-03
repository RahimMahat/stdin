import type { Out } from '../render/ast'

export interface Profile {
  name: string
  handle: string
  role: string
  years: string
  location: string
  timezone: string
  stack: string[]
  /** HTML. The one paragraph that runs in the serif. */
  bio: string
  email: string
  github: string
  linkedin: string
}

export interface Project {
  slug: string
  title: string
  summary: string
  order: number
  started: Date
  stack: string[]
  throughput: string
  latency: string
  broke: string
  fixed: string
  failed: boolean
  repo?: string
  /** The write-up, as HTML. Resolved from markdown in data/site.ts. */
  body: string
  /** Byte length of the write-up as written, in markdown. Powers `ls` size. */
  size: number
}

export interface Role {
  id: string
  org: string
  title: string
  start: Date
  end: Date | null
  location: string
  message: string
  body: string
}

export interface NowData {
  updated: Date
  building: string[]
  reading: string[]
  learning: string[]
  body: string
}

export interface SiteData {
  profile: Profile
  projects: Project[]
  roles: Role[]
  now: NowData
}

export interface Ctx {
  /** Positional arguments, e.g. ["projects/kafka-ingest"] for `cat projects/...`. */
  args: string[]
  /** `--tree` -> { tree: true }, `--since=2023` -> { since: "2023" }. */
  flags: Record<string, string | boolean>
  data: SiteData
}

export interface Command {
  name: string
  aliases?: string[]
  /** One line. Powers `help` and, in phase 2, the autocomplete list. */
  summary: string
  /** Shown by `help`. Omit when the command takes no arguments. */
  usage?: string
  /**
   * Whether this command has a fixed output worth a static page at /<name>.
   * `cat` is false because its output depends on an argument — its pages are
   * generated from the projects collection instead.
   */
  page: boolean
  /** Default argv used when rendering the static page, e.g. ["projects/"]. */
  pageArgs?: { args?: string[]; flags?: Record<string, string | boolean> }
  run(ctx: Ctx): Out[]
}
