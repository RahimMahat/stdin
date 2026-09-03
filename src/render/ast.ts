/**
 * The output AST.
 *
 * A command never returns HTML and never returns a string. It returns a list of
 * these nodes, and two renderers consume them:
 *
 *   render/static.ts   build time  -> HTML for /whoami, /projects/<slug>, ...
 *   render/live.ts     phase 2     -> streamed line-by-line into the terminal
 *
 * One content definition, two hosts. That is what buys SEO, no-JS support and
 * shareable URLs for free, and it is why nothing in commands/ may touch the DOM.
 */

export type Tone = 'dim' | 'accent' | 'ok' | 'fail'

export interface Cell {
  text: string
  tone?: Tone
  /** Renders as a link to another page / an external URL. */
  href?: string
  /** Renders as a runnable command chip. Implies href in the static renderer. */
  cmd?: string
}

export interface TreeNode {
  label: string
  note?: string
  children?: TreeNode[]
}

export interface CommitEntry {
  hash: string
  date: string
  org: string
  title: string
  message: string
  current?: boolean
}

/** Phase 3. Declared now so the renderer switch is exhaustive from the start. */
export interface GraphDef {
  nodes: { id: string; label: string; x: number; y: number; status: 'ok' | 'fail' | 'running' }[]
  edges: { from: string; to: string }[]
}

export type Out =
  | { t: 'line'; text: string; tone?: Tone }
  | { t: 'blank' }
  | { t: 'rule' }
  /**
   * Serif prose, as an HTML fragment. Markdown is resolved in the content layer
   * (`data/site.ts`) at build time, never here and never in the browser — which
   * is what lets the live renderer stay a few hundred bytes and ship no parser.
   */
  | { t: 'prose'; html: string }
  | { t: 'kv'; pairs: [string, string][] }
  | { t: 'table'; cols: string[]; rows: Cell[][] }
  | { t: 'tree'; root: TreeNode }
  | { t: 'log'; entries: CommitEntry[] }
  /**
   * Runnable commands. `grid` presents them as destinations rather than as a
   * line of output — the landing page needs them to read as the way in, which
   * inline chips do not.
   */
  | { t: 'cmds'; items: { name: string; label?: string }[]; grid?: boolean }
  | { t: 'graph'; def: GraphDef }

/* ------------------------------------------------------------------ */
/* Constructors — terser than object literals at every call site, and  */
/* they keep the discriminant strings in exactly one place.            */
/* ------------------------------------------------------------------ */

export const line = (text: string, tone?: Tone): Out => ({ t: 'line', text, tone })
export const blank = (): Out => ({ t: 'blank' })
export const rule = (): Out => ({ t: 'rule' })
export const prose = (html: string): Out => ({ t: 'prose', html })
export const kv = (pairs: [string, string][]): Out => ({ t: 'kv', pairs })
export const table = (cols: string[], rows: Cell[][]): Out => ({ t: 'table', cols, rows })
export const tree = (root: TreeNode): Out => ({ t: 'tree', root })
export const log = (entries: CommitEntry[]): Out => ({ t: 'log', entries })
export const cmds = (items: { name: string; label?: string }[], grid = false): Out => ({
  t: 'cmds',
  items,
  grid,
})
