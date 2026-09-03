import type { Out } from '../render/ast'
import { blank, cmds, line } from '../render/ast'
import { search, type Candidate } from './fuzzy'
import { runnable } from './naming'
import { cat } from './cat'
import { clear } from './clear'
import { contact } from './contact'
import { git } from './git'
import { makeHelp } from './help'
import { ls } from './ls'
import { now } from './now'
import { skills } from './skills'
import { theme } from './theme'
import type { Command, Ctx, SiteData } from './types'
import { whoami } from './whoami'

// Re-exported so the rest of the app has one import site for the command layer.
export { canonical, runnable } from './naming'

/**
 * The registry is the site map. Adding a section means adding a command here —
 * routes, the help table, and (in phase 2) autocomplete all read from this list,
 * so there is no second place to keep in sync.
 */
const base: Command[] = [whoami, ls, cat, skills, git, now, contact, theme, clear]

const help = makeHelp(() => registry)

export const registry: Command[] = [...base, help]

export function find(name: string): Command | undefined {
  const n = name.toLowerCase()
  return registry.find((c) => c.name === n || c.aliases?.includes(n))
}

/** Commands that own a static page at /<name>. */
export const pageCommands = (): Command[] => registry.filter((c) => c.page)

/**
 * Everything the site will accept, as text.
 *
 * Lives here rather than in the terminal because it is a fact about the command
 * layer, not about the UI — tab completion and the unknown-command fallback are
 * two readings of the same list, and they must not be able to disagree.
 */
export function candidates(data: SiteData | null): Candidate[] {
  const out: Candidate[] = []

  for (const c of registry) {
    if (c.name === 'cat') continue // expanded per project below
    out.push({ value: runnable(c), label: c.summary })
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

export interface Parsed {
  name: string
  args: string[]
  flags: Record<string, string | boolean>
}

/**
 * Splits an input line into a command, positional args and flags.
 * `git log --career` -> { name: 'git', args: ['log'], flags: { career: true } }
 */
export function parse(input: string): Parsed {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  const name = tokens.shift() ?? ''
  const args: string[] = []
  const flags: Record<string, string | boolean> = {}

  for (const tok of tokens) {
    if (tok.startsWith('--')) {
      const [k, ...rest] = tok.slice(2).split('=')
      if (k) flags[k] = rest.length ? rest.join('=') : true
    } else if (tok.startsWith('-') && tok.length > 1) {
      for (const ch of tok.slice(1)) flags[ch] = true
    } else {
      args.push(tok)
    }
  }
  return { name, args, flags }
}

/** Runs an input line against the registry. Unknown commands fail politely. */
export function run(input: string, data: SiteData): Out[] {
  const { name, args, flags } = parse(input)
  if (!name) return []
  const cmd = find(name)
  if (!cmd) {
    // Unknown input searches rather than scolding. A shell that only says "not
    // found" makes the visitor guess again; one that offers the three nearest
    // things turns a typo into navigation.
    const near = search(candidates(data), input, 3).filter((h) => h.score > -60)

    return [
      line(`${name}: command not found`, 'fail'),
      ...(near.length
        ? [blank(), line('did you mean:', 'dim'), cmds(near.map((h) => ({ name: h.value, label: h.label })))]
        : []),
      blank(),
      line('`help` lists every command.', 'dim'),
    ]
  }
  const ctx: Ctx = { args, flags, data }
  return cmd.run(ctx)
}

/** Renders a command in its canonical, argument-free form for its static page. */
export function runForPage(cmd: Command, data: SiteData): Out[] {
  const ctx: Ctx = {
    args: cmd.pageArgs?.args ?? [],
    flags: cmd.pageArgs?.flags ?? {},
    data,
  }
  return cmd.run(ctx)
}

/**
 * The URL that renders this exact input, or null when no page does.
 *
 * Strict on purpose. `hrefFor` below has to return *something* because a chip
 * is an anchor, but the shell uses this: pushing an unknown command to /help
 * would mean sharing that URL shows the help page rather than the error the
 * visitor actually saw, and a URL that lies about its own content is worse than
 * no URL change at all.
 *
 * `slugs` is optional so this stays callable from the static renderer, which
 * has no site data in scope; pass it wherever a wrong guess would matter.
 */
export function pageFor(input: string, slugs?: string[]): string | null {
  const { name, args } = parse(input)
  const cmd = find(name)
  if (!cmd) return null

  // `cat projects/<name>` is a usage template, not an argument. Placeholders
  // must never resolve to a route — they name a shape, not a page.
  const real = args.filter((a) => !/[<>]/.test(a))

  if (cmd.name === 'cat') {
    const slug = (real[0] ?? '').replace(/^\.?\/?projects\//, '').replace(/\/$/, '')
    if (!slug) return null
    // Hidden files are reachable only through the shell. Giving one a URL would
    // put it in the sitemap and undo the point of hiding it.
    if (slug.startsWith('.')) return null
    if (slugs && !slugs.includes(slug)) return null
    return `/projects/${slug}`
  }

  return cmd.page ? `/${cmd.name}` : null
}

/**
 * Resolves an input line to the URL a link should point at.
 *
 * Both renderers go through this, so a chip can never point at a route that was
 * not generated. Splitting on the first token would be wrong for exactly the
 * commands that matter: `cat projects/x` lives at /projects/x, not /cat.
 */
export function hrefFor(input: string): string {
  const page = pageFor(input)
  if (page) return page
  // No page renders this input. Send the reader somewhere that explains why.
  return parse(input).name === 'cat' ? '/ls' : '/help'
}
