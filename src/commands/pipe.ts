import { cmds, kv, line, log, table, type Cell, type CommitEntry, type KvValue, type Out, type Tone, type TreeNode } from '../render/ast'
import { text as plain } from './grep'

/**
 * Pipes: `ls | grep aws | wc -l`.
 *
 * What travels down a pipe here is rows, not text. A real shell flattens
 * everything to lines, and doing the same would turn a filtered `ls` into
 * plain strings — the chips that open a write-up would not survive a `grep`.
 * So output is taken apart into its rows, the filters work on those, and the
 * rows are put back into the node types they came from.
 *
 * Dim lines and command chips do not travel. They are commentary and
 * navigation — "14 entries, 3 to start with" — and counting them would make
 * `ls | wc -l` answer something other than how many projects there are. It is
 * the same split a shell makes between stdout and stderr.
 */

/** Splits on `|`, except inside quotes: `grep "a|b"` is one stage. */
export function splitPipes(input: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote = ''

  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = ''
      cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === '|') {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }

  out.push(cur.trim())
  return out
}

type Unit =
  | { k: 'row'; cols: string[]; cells: Cell[]; text: string }
  | { k: 'pair'; pair: [string, KvValue]; text: string }
  | { k: 'entry'; entry: CommitEntry; text: string }
  | { k: 'line'; tone?: Tone; text: string }

const valueText = (v: KvValue): string => (typeof v === 'string' ? v : v.text)

/** Leaves only, each under its path: `ingestion/AWS Glue  PySpark ETL jobs`. */
function leaves(node: TreeNode, path: string[], out: Unit[]): void {
  if (!node.children?.length) {
    out.push({ k: 'line', text: `${[...path, node.label].join('/')}${node.note ? `  ${node.note}` : ''}` })
    return
  }
  for (const c of node.children) leaves(c, [...path, node.label.replace(/\/$/, '')], out)
}

function explode(nodes: Out[]): Unit[] {
  const out: Unit[] = []

  for (const n of nodes) {
    switch (n.t) {
      case 'table':
        for (const cells of n.rows) out.push({ k: 'row', cols: n.cols, cells, text: cells.map((c) => c.text).join('  ') })
        break
      case 'kv':
        for (const pair of n.pairs) out.push({ k: 'pair', pair, text: `${pair[0]}  ${valueText(pair[1])}` })
        break
      case 'log':
        for (const e of n.entries) {
          out.push({ k: 'entry', entry: e, text: [e.hash, e.date, e.org, e.title, e.message].join('  ') })
        }
        break
      case 'tree':
        // The root is the directory the tree was printed from, not a row in it.
        for (const c of n.root.children ?? []) leaves(c, [], out)
        break
      case 'prose':
        // A write-up goes down the pipe a paragraph at a time, as text. The
        // serif and the links stay behind, which is what a pipe does to them.
        for (const para of n.html.split(/<\/(?:p|li|h[1-6]|pre|blockquote)>/)) {
          const t = plain(para).replace(/\s+/g, ' ').trim()
          if (t) out.push({ k: 'line', text: t })
        }
        break
      case 'line':
        if (n.tone !== 'dim' && n.text.trim()) out.push({ k: 'line', tone: n.tone, text: n.text })
        break
      default:
        // blank, rule, cmds, rain, graph: layout, navigation and decoration.
        break
    }
  }

  return out
}

function implode(units: Unit[]): Out[] {
  const out: Out[] = []

  for (let i = 0; i < units.length; ) {
    const u = units[i]
    let j = i + 1

    if (u.k === 'row') {
      const cols = u.cols.join('\u0000')
      while (j < units.length && units[j].k === 'row' && (units[j] as typeof u).cols.join('\u0000') === cols) j++
      out.push(table(u.cols, units.slice(i, j).map((r) => (r as typeof u).cells)))
    } else if (u.k === 'pair') {
      while (j < units.length && units[j].k === 'pair') j++
      out.push(kv(units.slice(i, j).map((p) => (p as typeof u).pair)))
    } else if (u.k === 'entry') {
      while (j < units.length && units[j].k === 'entry') j++
      out.push(log(units.slice(i, j).map((e) => (e as typeof u).entry)))
    } else {
      out.push(line(u.text, u.tone))
    }

    i = j
  }

  return out
}

/* ---------------------------------------------------------------- */
/* filters                                                           */
/* ---------------------------------------------------------------- */

/** A filter returns the rows it keeps, or a string saying why it cannot run. */
type Filter = (units: Unit[], arg: string) => Unit[] | string

/** `-3`, `-n 3`, `-n3` or `3`. Read here because the shell parser takes `-3` for a flag. */
function count(arg: string, name: string): number | string {
  if (!arg) return 10
  const m = /^(?:-n\s*)?-?(\d+)$/.exec(arg)
  return m ? Number(m[1]) : `${name}: expected a number of rows, as in \`${name} -3\``
}

const FILTERS: Record<string, Filter> = {
  grep(units, arg) {
    const invert = /(^|\s)-v(\s|$)/.test(arg)
    const term = arg
      .replace(/(^|\s)-[iv]+(?=\s|$)/g, ' ')
      .trim()
      .replace(/^["']|["']$/g, '')
      .toLowerCase()
    if (!term) return 'grep: needs something to look for, as in `ls | grep aws`'
    return units.filter((u) => u.text.toLowerCase().includes(term) !== invert)
  },
  head(units, arg) {
    const n = count(arg, 'head')
    return typeof n === 'string' ? n : units.slice(0, n)
  },
  tail(units, arg) {
    const n = count(arg, 'tail')
    return typeof n === 'string' ? n : n === 0 ? [] : units.slice(-n)
  },
  sort(units, arg) {
    if (arg && arg !== '-r') return 'sort: takes -r or nothing'
    const sorted = [...units].sort((a, b) => a.text.localeCompare(b.text, 'en', { numeric: true }))
    return arg === '-r' ? sorted.reverse() : sorted
  },
  wc(units, arg) {
    if (arg && arg !== '-l') return 'wc: counts rows; it takes -l or nothing'
    return [{ k: 'line', text: String(units.length) }]
  },
}

export const filterNames = Object.keys(FILTERS)
export const isFilter = (name: string): boolean => name.toLowerCase() in FILTERS

const split = (stage: string): [string, string] => {
  const name = stage.split(/\s+/)[0] ?? ''
  return [name.toLowerCase(), stage.slice(name.length).trim()]
}

/**
 * Runs `first | filter | filter`. `first` is produced by the caller, which
 * knows the registry; this module deliberately does not, so that the registry
 * can import it without closing a cycle.
 *
 * `known` says whether a name is a real command, so that `ls | cat` can be
 * told apart from `ls | nope` — one is a command that does not read a pipe,
 * the other is not a command.
 */
export function pipeline(first: Out[], stages: string[], known: (name: string) => boolean): Out[] {
  let units = explode(first)

  for (const stage of stages) {
    const [name, arg] = split(stage)

    if (!name) return [line('nothing on one side of the pipe', 'fail'), filtersLine()]

    const filter = FILTERS[name]
    if (!filter) {
      return [
        line(known(name) ? `${name} does not read from a pipe` : `${name}: command not found`, 'fail'),
        filtersLine(),
      ]
    }

    const next = filter(units, arg)
    if (typeof next === 'string') return [line(next, 'fail')]
    units = next
  }

  // A shell prints nothing here. An empty block under a prompt reads as broken.
  return units.length ? implode(units) : [line('no rows left', 'dim')]
}

const filtersLine = (): Out => line(`what reads from a pipe: ${filterNames.join(', ')}`, 'dim')

const EXAMPLE: Record<string, string> = {
  head: 'ls | head -3',
  tail: 'ls | tail -3',
  sort: 'ls | sort -r',
  wc: 'ls | wc -l',
}

/** A filter typed on its own has nothing to read. Say so, with one that works. */
export function alone(name: string): Out[] {
  const n = name.toLowerCase()
  return [line(`${n} reads from a pipe, and nothing was piped in`, 'fail'), cmds([{ name: EXAMPLE[n] ?? 'ls | wc -l' }])]
}
