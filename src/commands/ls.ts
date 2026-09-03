import { blank, cmds, line, table, type Cell, type Out } from '../render/ast'
import { hiddenFiles } from '../data/hidden'
import { bytes, ymd } from './fmt'
import type { Command, Ctx } from './types'

export const ls: Command = {
  name: 'ls',
  summary: 'list the projects',
  usage: 'ls projects/',
  page: true,
  pageArgs: { args: ['projects/'] },
  run({ data, flags }: Ctx): Out[] {
    const rows: Cell[][] = data.projects.map((p) => [
      { text: p.slug, cmd: `cat projects/${p.slug}`, tone: p.failed ? 'fail' : undefined },
      { text: bytes(p.size), tone: 'dim' },
      { text: ymd(p.started), tone: 'dim' },
      { text: p.stack.slice(0, 3).join(' · '), tone: 'dim' },
      { text: p.failed ? 'failed' : 'ok', tone: p.failed ? 'fail' : 'ok' },
    ])

    // `-a` / `--all`, exactly as a shell would take it. Undocumented on purpose:
    // it is only found by someone whose reflex is to ask a directory what it is
    // not showing them, which is the whole of the joke.
    const all = flags.a === true || flags.all === true
    const failed = data.projects.filter((p) => p.failed).length

    const tail = failed
      ? `cat one for the write-up. ${failed} of these did not work; that one is worth reading first.`
      : 'cat one for the write-up: the problem, the architecture, what broke, and what changed.'

    return [
      line(
        all
          ? `${data.projects.length + hiddenFiles.length} entries, ${hiddenFiles.length} hidden`
          : `${data.projects.length} entries`,
        'dim',
      ),
      blank(),
      table(['name', 'size', 'started', 'stack', 'result'], rows),
      blank(),
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
    ]
  },
}
