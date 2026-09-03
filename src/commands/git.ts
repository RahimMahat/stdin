import { blank, line, log, type Out } from '../render/ast'
import { mon, shortHash, span } from './fmt'
import type { Command, Ctx } from './types'

export const git: Command = {
  name: 'git',
  summary: 'the experience timeline as commit history',
  usage: 'git log --career',
  page: true,
  pageArgs: { args: ['log'], flags: { career: true } },
  run({ data }: Ctx): Out[] {
    const entries = data.roles.map((r) => ({
      hash: shortHash(`${r.org}:${r.start.toISOString()}`),
      date: r.end ? `${mon(r.start)} → ${mon(r.end)}` : `${mon(r.start)} → HEAD`,
      org: r.org,
      title: r.title,
      message: `${r.message}  (${span(r.start, r.end)}, ${r.location})`,
      current: r.end === null,
    }))

    return [
      line(`${entries.length} commits on branch career`, 'dim'),
      blank(),
      log(entries),
      blank(),
      line('newest first, as a log should be.', 'dim'),
    ]
  },
}
