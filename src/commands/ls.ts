import { blank, cmds, line, table, type Cell, type Out } from '../render/ast'
import { hiddenFiles } from '../data/hidden'
import { bytes } from './fmt'
import type { Command, Ctx, Project } from './types'

/**
 * One project as a table row: its name and what came of it.
 *
 * The listing used to print size, start date and `ok` — three columns that were
 * true of every row and a reason to open none of them. The result was already
 * written in every file and shown nowhere here, so a slug like `flowctl` was
 * all a reader had to go on.
 *
 * Two cells and not three. The stack was the third until it was looked at in a
 * browser: name, result and stack come to more characters than the page is
 * wide, so every row wrapped and the list stopped being scannable, which was
 * the one thing it was for. The stack is on each project's own page, and `grep`
 * searches it.
 *
 * Exported because `grep` prints its hits with it. A match should read exactly
 * like the listing it came out of.
 */
export const row = (p: Project): Cell[] => [
  { text: p.slug, cmd: `cat projects/${p.slug}`, tone: p.failed ? 'fail' : undefined },
  { text: p.hook },
]

export const COLS = ['name', 'result']

/** A headed table, or nothing at all — an empty group does not get a heading. */
function group(title: string, projects: Project[], kind = false): Out[] {
  if (projects.length === 0) return []
  return [
    line(title, 'dim'),
    table(
      kind ? [...COLS, 'kind'] : COLS,
      projects.map((p) => (kind ? [...row(p), { text: p.kind, tone: 'dim' as const }] : row(p))),
    ),
    blank(),
  ]
}

export const ls: Command = {
  name: 'ls',
  summary: 'list the projects',
  usage: 'ls projects/',
  page: true,
  pageArgs: { args: ['projects/'] },
  run({ data, flags }: Ctx): Out[] {
    // Three groups rather than one column of thirteen. Most of these are parts
    // of a single platform built for one employer and a few are standalone
    // builds with their source attached, and a flat list made a reader work
    // that out from a `kind` column. The headings say it instead, which is why
    // only the first group — the one that can mix the two — still carries one.
    const featured = data.projects.filter((p) => p.featured)
    const rest = data.projects.filter((p) => !p.featured)

    // `-a` / `--all`, exactly as a shell would take it. Undocumented on purpose:
    // it is only found by someone whose reflex is to ask a directory what it is
    // not showing them, which is the whole of the joke.
    const all = flags.a === true || flags.all === true
    const failed = data.projects.filter((p) => p.failed).length

    const tail = failed
      ? `cat one for the write-up. ${failed} of these did not work; that one is worth reading first.`
      : 'cat one for the write-up: the problem, the architecture, what broke, and what changed.'

    const count = `${data.projects.length} entries`

    return [
      line(
        all
          ? `${data.projects.length + hiddenFiles.length} entries, ${hiddenFiles.length} hidden`
          : featured.length
            ? `${count}, ${featured.length} to start with`
            : count,
        'dim',
      ),
      blank(),
      ...group('start here', featured, true),
      ...group(
        'production · one AWS platform at Infocepts',
        rest.filter((p) => p.kind === 'work'),
      ),
      ...group(
        'independent · source linked',
        rest.filter((p) => p.kind === 'personal'),
      ),
      ...(all
        ? [
            line('hidden', 'dim'),
            cmds(
              hiddenFiles.map((f) => ({
                name: `cat ${f.name}`,
                label: f.body === null ? '—' : bytes(f.body.length),
              })),
            ),
            blank(),
          ]
        : []),
      line(tail, 'dim'),
      line('grep <term> searches every one of them.', 'dim'),
    ]
  },
}
