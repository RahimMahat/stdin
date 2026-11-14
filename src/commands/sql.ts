import { blank, cmds, line, table, type Cell, type Out } from '../render/ast'
import { skills as skillTree } from '../data/skills'
import { ymd } from './fmt'
import type { Command, Ctx, SiteData } from './types'

/**
 * sql, over the site's own content.
 *
 * The site says it is queried rather than browsed, and until this the only
 * query it took was a substring. The people it is written for read a SELECT
 * faster than they read a nav bar, and the content was already three tables.
 *
 * One SELECT over one table: where, order by, limit, count(*). No joins, no
 * group by, no subqueries — at fourteen rows nothing here needs them, and each
 * would be parser written for a query nobody will type.
 *
 * Hand-written rather than DuckDB-WASM. That is several megabytes of engine to
 * filter three arrays, on a site whose whole bundle is a few kilobytes and
 * whose rule is no runtime dependencies.
 *
 * Comparison follows SQLite, because that is the dialect most readers will
 * assume of something this small: `=` is exact, `like` ignores case.
 */

type Value = string | number | boolean | null
type Row = Record<string, Value>

interface Table {
  cols: string[]
  rows: Row[]
}

/** The content as rows. Column names are the ones the pages already print. */
function tables(data: SiteData): Record<string, Table> {
  return {
    projects: {
      cols: ['slug', 'title', 'kind', 'date', 'stack', 'hook', 'scale', 'outcome', 'failed', 'featured', 'repo', 'size'],
      rows: data.projects.map((p) => ({
        slug: p.slug,
        title: p.title,
        kind: p.kind,
        date: ymd(p.started),
        stack: p.stack.join(', '),
        hook: p.hook,
        scale: p.throughput,
        outcome: p.latency,
        failed: p.failed,
        featured: p.featured,
        repo: p.repo ?? null,
        size: p.size,
      })),
    },
    roles: {
      cols: ['org', 'title', 'start', 'end', 'location', 'message'],
      rows: data.roles.map((r) => ({
        org: r.org,
        title: r.title,
        start: ymd(r.start),
        end: r.end ? ymd(r.end) : null,
        location: r.location,
        message: r.message,
      })),
    },
    skills: {
      cols: ['stage', 'skill', 'note'],
      rows: (skillTree.children ?? []).flatMap((stage) =>
        (stage.children ?? []).map((s) => ({ stage: stage.label, skill: s.label, note: s.note ?? null })),
      ),
    },
  }
}

/* ---------------------------------------------------------------- */
/* tokens                                                            */
/* ---------------------------------------------------------------- */

type Tok =
  | { k: 'word'; v: string }
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'sym'; v: string }

/** Thrown for anything the grammar does not cover, and caught in `run`. */
class SqlError extends Error {}

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0

  while (i < src.length) {
    const ch = src[i]

    if (/\s/.test(ch)) {
      i++
    } else if (ch === "'" || ch === '"') {
      // A doubled quote is a literal one, as in every SQL there is.
      let v = ''
      let j = i + 1
      for (;;) {
        if (j >= src.length) throw new SqlError(`unterminated string starting at ${src.slice(i, i + 12)}`)
        if (src[j] === ch && src[j + 1] === ch) {
          v += ch
          j += 2
        } else if (src[j] === ch) {
          break
        } else {
          v += src[j++]
        }
      }
      out.push({ k: 'str', v })
      i = j + 1
    } else if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^-?[0-9]+(\.[0-9]+)?/.exec(src.slice(i))!
      out.push({ k: 'num', v: Number(m[0]) })
      i += m[0].length
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!
      out.push({ k: 'word', v: m[0].toLowerCase() })
      i += m[0].length
    } else {
      const two = src.slice(i, i + 2)
      const sym = ['!=', '<>', '<=', '>='].includes(two) ? two : '=<>,*();'.includes(ch) ? ch : null
      if (!sym) throw new SqlError(`unexpected "${ch}"`)
      out.push({ k: 'sym', v: sym })
      i += sym.length
    }
  }

  return out
}

const show = (t: Tok | undefined): string => (t === undefined ? 'the end of the query' : `"${t.v}"`)

/* ---------------------------------------------------------------- */
/* parse                                                             */
/* ---------------------------------------------------------------- */

type Pred = (row: Row) => boolean

interface Query {
  /** null is `*`, 'count' is `count(*)`. */
  select: string[] | null | 'count'
  from: string
  where: Pred | null
  order: { col: string; desc: boolean } | null
  limit: number | null
}

function like(pattern: string): RegExp {
  const body = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${body}$`, 'is')
}

function compare(a: Value, b: Value): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

class Parser {
  private at = 0

  constructor(
    private toks: Tok[],
    private all: Record<string, Table>,
  ) {}

  private peek(): Tok | undefined {
    return this.toks[this.at]
  }

  private word(w: string): boolean {
    const t = this.peek()
    if (t?.k === 'word' && t.v === w) {
      this.at++
      return true
    }
    return false
  }

  private sym(s: string): boolean {
    const t = this.peek()
    if (t?.k === 'sym' && t.v === s) {
      this.at++
      return true
    }
    return false
  }

  private expect(w: string): void {
    if (!this.word(w)) throw new SqlError(`expected ${w.toUpperCase()}, found ${show(this.peek())}`)
  }

  private ident(what: string): string {
    const t = this.peek()
    if (t?.k !== 'word') throw new SqlError(`expected ${what}, found ${show(t)}`)
    this.at++
    return t.v
  }

  query(): Query {
    this.expect('select')

    let select: Query['select']
    if (this.sym('*')) {
      select = null
    } else if (this.peek()?.v === 'count' && this.toks[this.at + 1]?.v === '(') {
      this.at += 2
      if (!this.sym('*') || !this.sym(')')) throw new SqlError('count takes (*) and nothing else')
      select = 'count'
    } else {
      select = [this.ident('a column')]
      while (this.sym(',')) select.push(this.ident('a column'))
    }

    this.expect('from')
    const from = this.ident('a table')
    const t = this.all[from]
    if (!t) throw new SqlError(`no such table "${from}". tables: ${Object.keys(this.all).join(', ')}`)

    const col = (name: string): string => {
      if (!t.cols.includes(name)) {
        throw new SqlError(`no such column "${name}" in ${from}. columns: ${t.cols.join(', ')}`)
      }
      return name
    }
    if (Array.isArray(select)) select.forEach(col)

    const where = this.word('where') ? this.or(col) : null

    let order: Query['order'] = null
    if (this.word('order')) {
      this.expect('by')
      const c = col(this.ident('a column'))
      const desc = this.word('desc')
      if (!desc) this.word('asc')
      order = { col: c, desc }
    }

    let limit: number | null = null
    if (this.word('limit')) {
      const n = this.peek()
      if (n?.k !== 'num' || !Number.isInteger(n.v) || n.v < 0) {
        throw new SqlError(`limit takes a whole number, found ${show(n)}`)
      }
      this.at++
      limit = n.v
    }

    this.sym(';')
    if (this.peek()) throw new SqlError(`unexpected ${show(this.peek())}`)

    return { select, from, where, order, limit }
  }

  private or(col: (n: string) => string): Pred {
    let left = this.and(col)
    while (this.word('or')) {
      const a = left
      const b = this.and(col)
      left = (r) => a(r) || b(r)
    }
    return left
  }

  private and(col: (n: string) => string): Pred {
    let left = this.cond(col)
    while (this.word('and')) {
      const a = left
      const b = this.cond(col)
      left = (r) => a(r) && b(r)
    }
    return left
  }

  private cond(col: (n: string) => string): Pred {
    if (this.sym('(')) {
      const inner = this.or(col)
      if (!this.sym(')')) throw new SqlError(`expected ")", found ${show(this.peek())}`)
      return inner
    }

    const c = col(this.ident('a column'))

    if (this.word('is')) {
      const not = this.word('not')
      this.expect('null')
      return (r) => (r[c] === null) !== not
    }

    const not = this.word('not')
    if (this.word('like')) {
      const p = this.peek()
      if (p?.k !== 'str') throw new SqlError(`like takes a quoted pattern, found ${show(p)}`)
      this.at++
      const re = like(p.v)
      return (r) => r[c] !== null && re.test(String(r[c])) !== not
    }
    if (not) throw new SqlError(`expected LIKE after NOT, found ${show(this.peek())}`)

    const op = this.peek()
    if (op?.k !== 'sym' || !['=', '!=', '<>', '<', '>', '<=', '>='].includes(op.v)) {
      throw new SqlError(`expected a comparison after ${c}, found ${show(op)}`)
    }
    this.at++

    const v = this.value()
    // A comparison with NULL is never true, which is why `is null` exists.
    return (r) => {
      const cell = r[c]
      if (cell === null) return false
      const d = compare(cell, v)
      switch (op.v) {
        case '=':
          return d === 0
        case '<':
          return d < 0
        case '>':
          return d > 0
        case '<=':
          return d <= 0
        case '>=':
          return d >= 0
        default:
          return d !== 0
      }
    }
  }

  private value(): Value {
    const t = this.peek()
    if (t?.k === 'str' || t?.k === 'num') {
      this.at++
      return t.v
    }
    if (t?.k === 'word' && (t.v === 'true' || t.v === 'false')) {
      this.at++
      return t.v === 'true'
    }
    throw new SqlError(`expected a value, found ${show(t)}. strings take single quotes`)
  }
}

/* ---------------------------------------------------------------- */
/* run                                                               */
/* ---------------------------------------------------------------- */

interface Result {
  cols: string[]
  rows: Row[]
  from: string
}

function execute(src: string, data: SiteData): Result {
  const all = tables(data)
  const q = new Parser(tokenize(src), all).query()
  const t = all[q.from]

  let rows = q.where ? t.rows.filter(q.where) : [...t.rows]

  if (q.select === 'count') return { cols: ['count(*)'], rows: [{ 'count(*)': rows.length }], from: q.from }

  if (q.order) {
    const { col, desc } = q.order
    // NULLs sort last either way, so `order by end desc` does not open on them.
    rows.sort((a, b) =>
      a[col] === null ? 1 : b[col] === null ? -1 : desc ? compare(b[col], a[col]) : compare(a[col], b[col]),
    )
  }
  if (q.limit !== null) rows = rows.slice(0, q.limit)

  return { cols: q.select ?? t.cols, rows, from: q.from }
}

/** A result cell. A project's slug is a way into its write-up, as in `ls`. */
function cell(from: string, col: string, v: Value): Cell {
  if (v === null) return { text: 'NULL', tone: 'dim' }
  if (from === 'projects' && col === 'slug') return { text: String(v), cmd: `cat projects/${v}` }
  if (col === 'repo') return { text: String(v).replace(/^https?:\/\//, ''), href: String(v) }
  return { text: String(v) }
}

const rowsLabel = (n: number): string => `${n} row${n === 1 ? '' : 's'}`

const quote = (s: string): string => `'${s.replace(/'/g, "''")}'`

/**
 * Queries worth offering, built from the content and then run, so that none of
 * them can be one that comes back empty — the same rule `grep` keeps.
 */
function examples(data: SiteData): { name: string; label: string }[] {
  const seen = new Map<string, number>()
  for (const p of data.projects) for (const s of p.stack) seen.set(s, (seen.get(s) ?? 0) + 1)
  const top = [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
  const stage = skillTree.children?.[0]?.label

  return [
    ...(top ? [`select slug, outcome from projects where stack like ${quote(`%${top}%`)}`] : []),
    `select slug, date from projects order by date desc limit 3`,
    `select count(*) from projects where kind = 'personal'`,
    `select title, start from roles where end is null`,
    ...(stage ? [`select skill, note from skills where stage = ${quote(stage)}`] : []),
  ]
    .map((q) => {
      const r = execute(q, data)
      const n = r.cols[0] === 'count(*)' ? Number(r.rows[0]['count(*)']) : r.rows.length
      return { name: `sql ${q}`, label: r.cols[0] === 'count(*)' ? String(n) : rowsLabel(n), n }
    })
    .filter((e) => e.n > 0)
    .map(({ name, label }) => ({ name, label }))
}

const typeOf = (rows: Row[], col: string): string => {
  const v = rows.map((r) => r[col]).find((x) => x !== null)
  return typeof v === 'number' ? 'int' : typeof v === 'boolean' ? 'bool' : 'text'
}

function schema(data: SiteData): Out {
  const all = tables(data)
  return table(
    ['table', 'rows', 'columns'],
    Object.entries(all).map(([name, t]) => [
      { text: name, cmd: `sql describe ${name}` },
      { text: String(t.rows.length) },
      { text: t.cols.join(', '), tone: 'dim' as const },
    ]),
  )
}

export const sql: Command = {
  name: 'sql',
  summary: 'query the projects, roles and skills with a SELECT',
  usage: 'sql <query>',
  // The page is the schema. A query's result depends on the query, and a URL
  // has to name one thing — the same reason `grep` has no page at all.
  page: true,
  bareOnly: true,
  run({ raw, data }: Ctx): Out[] {
    const src = (raw ?? '').trim()

    if (!src) {
      return [
        line("a SELECT over this site's own content. three tables:", 'dim'),
        blank(),
        schema(data),
        blank(),
        cmds(examples(data)),
        blank(),
        line('select … from … [where …] [order by …] [limit n]', 'dim'),
        line("strings take single quotes. like takes % and ignores case; = does not.", 'dim'),
      ]
    }

    const words = src.toLowerCase().replace(/;$/, '').trim().split(/\s+/)

    if (words.join(' ') === 'show tables') return [schema(data)]

    if (words[0] === 'describe' || words[0] === 'desc') {
      const all = tables(data)
      const t = all[words[1] ?? '']
      if (!t || words.length !== 2) {
        return [line(`sql: describe takes one table. tables: ${Object.keys(all).join(', ')}`, 'fail')]
      }
      return [table(['column', 'type'], t.cols.map((c) => [{ text: c }, { text: typeOf(t.rows, c), tone: 'dim' as const }]))]
    }

    try {
      const r = execute(src, data)
      if (r.cols[0] === 'count(*)' || r.rows.length > 0) {
        return [
          ...(r.cols[0] === 'count(*)' ? [] : [line(rowsLabel(r.rows.length), 'dim'), blank()]),
          table(
            r.cols,
            r.rows.map((row) => r.cols.map((c) => cell(r.from, c, row[c]))),
          ),
        ]
      }
      return [line('0 rows', 'dim')]
    } catch (e) {
      // Anything the parser did not anticipate is still an error message and
      // never a broken prompt.
      const msg = e instanceof SqlError ? e.message : 'could not read that query'
      return [line(`sql: ${msg}`, 'fail'), line('bare `sql` lists the tables and a few queries that work.', 'dim')]
    }
  },
}
