import { blank, cmds, kv, line, prose, rule, type Out } from '../render/ast'
import { findHidden } from '../data/hidden'
import { ymd } from './fmt'
import type { Command, Ctx, Project, SiteData } from './types'

/** Shared by the `cat` command and by /projects/<slug> page generation. */
export function projectOutput(p: Project, data: SiteData): Out[] {
  const siblings = data.projects.filter((s) => s.slug !== p.slug).slice(0, 3)
  return [
    line(p.title, 'accent'),
    line(p.summary, 'dim'),
    blank(),
    kv([
      ['started', ymd(p.started)],
      ['stack', p.stack.join(', ')],
      ['scale', p.throughput],
      ['latency', p.latency],
      ['result', p.failed ? 'failed — post-mortem below' : 'in production'],
      ...(p.repo ? ([['repo', p.repo]] as [string, string][]) : []),
    ]),
    blank(),
    prose(p.body),
    rule(),
    line('what broke', 'accent'),
    prose(p.broke),
    blank(),
    line('what I changed', 'accent'),
    prose(p.fixed),
    blank(),
    ...(siblings.length
      ? [cmds(siblings.map((s) => ({ name: `cat projects/${s.slug}`, label: s.summary })))]
      : []),
  ]
}

export const cat: Command = {
  name: 'cat',
  summary: 'read a project write-up',
  usage: 'cat projects/<name>',
  // Output depends on an argument, so there is no single /cat page. The pages
  // are generated from the projects collection instead.
  page: false,
  run({ args, data }: Ctx): Out[] {
    const raw = args[0] ?? ''

    // Dotfiles first: `cat .plan` must not be mistaken for a project slug.
    // These have no page and never will — a URL would let a crawler index the
    // one thing on this site that is supposed to be earned.
    if (raw.startsWith('.') && !raw.startsWith('./projects')) {
      const file = findHidden(raw)
      if (!file) return [line(`cat: ${raw}: no such file`, 'fail')]
      if (file.body === null) {
        return [line(`cat: ${raw}: permission denied`, 'fail'), line('nice try.', 'dim')]
      }
      return [
        line(file.name, 'accent'),
        rule(),
        ...file.body.split('\n').map((l) => (l ? line(l) : blank())),
      ]
    }

    const target = raw.replace(/^\.?\/?projects\//, '').replace(/\/$/, '')
    if (!target) {
      return [
        line('cat: needs a file', 'fail'),
        line('usage: cat projects/<name>', 'dim'),
        blank(),
        cmds(data.projects.map((p) => ({ name: `cat projects/${p.slug}` }))),
      ]
    }
    const p = data.projects.find((x) => x.slug === target)
    if (!p) {
      return [
        line(`cat: projects/${target}: no such file`, 'fail'),
        blank(),
        line('did you mean:', 'dim'),
        cmds(data.projects.map((x) => ({ name: `cat projects/${x.slug}` }))),
      ]
    }
    return projectOutput(p, data)
  },
}
