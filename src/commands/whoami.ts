import { blank, cmds, kv, prose, type Out } from '../render/ast'
import type { Command, Ctx } from './types'

export const whoami: Command = {
  name: 'whoami',
  summary: 'who this is, in one record and one paragraph',
  page: true,
  run({ data }: Ctx): Out[] {
    const p = data.profile
    return [
      kv([
        ['name', p.name],
        ['role', p.role],
        ['experience', p.years],
        ['location', `${p.location} · ${p.availability}`],
        ['timezone', p.timezone],
        ['stack', p.stack.join(', ')],
      ]),
      blank(),
      prose(p.bio),
      blank(),
      cmds([
        { name: 'ls projects/', label: 'what he has built' },
        { name: 'git log --career', label: 'how he got here' },
      ]),
    ]
  },
}
