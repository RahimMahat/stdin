import { blank, line, table, type Out } from '../render/ast'
import type { Command, Ctx } from './types'

export const contact: Command = {
  name: 'contact',
  aliases: ['mail'],
  summary: 'email, github, linkedin',
  page: true,
  run({ data }: Ctx): Out[] {
    const p = data.profile
    return [
      table(
        ['channel', 'address'],
        [
          [{ text: 'email' }, { text: p.email, href: `mailto:${p.email}` }],
          [{ text: 'github' }, { text: p.github.replace(/^https?:\/\//, ''), href: p.github }],
          [{ text: 'linkedin' }, { text: p.linkedin.replace(/^https?:\/\//, ''), href: p.linkedin }],
        ],
      ),
      blank(),
      line('plain lines, copyable. a message form lands here in phase 4.', 'dim'),
    ]
  },
}
