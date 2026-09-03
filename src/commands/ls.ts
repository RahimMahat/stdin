import { blank, line, table, type Cell, type Out } from '../render/ast'
import { bytes, ymd } from './fmt'
import type { Command, Ctx } from './types'

export const ls: Command = {
  name: 'ls',
  summary: 'list the projects',
  usage: 'ls projects/',
  page: true,
  pageArgs: { args: ['projects/'] },
  run({ data }: Ctx): Out[] {
    const rows: Cell[][] = data.projects.map((p) => [
      { text: p.slug, cmd: `cat projects/${p.slug}`, tone: p.failed ? 'fail' : undefined },
      { text: bytes(p.size), tone: 'dim' },
      { text: ymd(p.started), tone: 'dim' },
      { text: p.stack.slice(0, 3).join(' · '), tone: 'dim' },
      { text: p.failed ? 'failed' : 'ok', tone: p.failed ? 'fail' : 'ok' },
    ])

    const failed = data.projects.filter((p) => p.failed).length
    return [
      line(`${data.projects.length} entries`, 'dim'),
      blank(),
      table(['name', 'size', 'started', 'stack', 'result'], rows),
      blank(),
      line(
        failed
          ? `cat one for the write-up. ${failed} of these did not work; that one is worth reading first.`
          : 'cat one for the write-up: the problem, the architecture, what broke, and what changed.',
        'dim',
      ),
    ]
  },
}
