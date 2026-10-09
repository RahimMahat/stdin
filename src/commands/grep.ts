import { blank, cmds, line, table, type Out } from '../render/ast'
import { COLS, row } from './ls'
import type { Command, Ctx, Project } from './types'

/**
 * grep, over the projects.
 *
 * For the reader who arrives with a word rather than with time: someone holding
 * a job description who wants to know whether Terraform, or Iceberg, or a dead
 * letter queue appears anywhere in here. `ls` is for deciding what to read;
 * this is for someone who has already decided what they are looking for.
 *
 * A plain substring over thirteen documents. Ranking, stemming and fuzzy
 * matching would each change an answer at a few hundred documents and none of
 * them changes one here.
 *
 * No page of its own. Its output depends on what was typed, and a URL has to
 * name one thing.
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

/** The write-ups arrive as HTML. Searching the markup would match on tag names. */
const text = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ').replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e)

const haystack = (p: Project): string =>
  [
    p.slug,
    p.title,
    p.summary,
    p.hook,
    p.stack.join(' '),
    p.throughput,
    p.latency,
    text(p.broke),
    text(p.fixed),
    text(p.body),
  ]
    .join(' ')
    .toLowerCase()

const matches = (projects: Project[], term: string): Project[] =>
  projects.filter((p) => haystack(p).includes(term.toLowerCase()))

/**
 * Searches worth offering, taken from the content: the stack entries the most
 * projects share. Computed rather than written down so that an example can
 * never be a search that returns nothing.
 */
function examples(projects: Project[], limit = 5): { name: string; label: string }[] {
  const seen = new Map<string, number>()
  for (const p of projects) for (const s of p.stack) seen.set(s, (seen.get(s) ?? 0) + 1)

  return [...seen.keys()]
    .map((s) => ({ term: s.toLowerCase(), n: matches(projects, s).length }))
    .sort((a, b) => b.n - a.n || a.term.localeCompare(b.term))
    .slice(0, limit)
    .map(({ term, n }) => ({ name: `grep ${term}`, label: `${n} projects` }))
}

export const grep: Command = {
  name: 'grep',
  summary: 'search every project write-up',
  usage: 'grep <term>',
  page: false,
  run({ args, data }: Ctx): Out[] {
    // Quotes are how anyone would type a two-word search, and the parser hands
    // them through as part of the words.
    const term = args
      .join(' ')
      .replace(/^["']|["']$/g, '')
      .trim()

    if (!term) {
      return [
        line('usage: grep <term>', 'dim'),
        line('searches every write-up, its stack and its numbers.', 'dim'),
        blank(),
        cmds(examples(data.projects)),
      ]
    }

    const hits = matches(data.projects, term)

    if (hits.length === 0) {
      return [
        line(`nothing mentions "${term}"`, 'fail'),
        blank(),
        cmds([{ name: 'ls projects/', label: 'all of them' }]),
      ]
    }

    return [
      line(`${hits.length} of ${data.projects.length} mention "${term}"`, 'dim'),
      blank(),
      table(COLS, hits.map(row)),
    ]
  },
}
