import { blank, kv, line, prose, type Out } from '../render/ast'
import { daysAgo, ymd } from './fmt'
import type { Command, Ctx } from './types'

export const now: Command = {
  name: 'now',
  summary: 'what he is building, reading and learning this month',
  page: true,
  run({ data }: Ctx): Out[] {
    const n = data.now
    const age = daysAgo(n.updated)
    return [
      line(`last updated ${ymd(n.updated)} — ${age} day${age === 1 ? '' : 's'} ago`, age > 45 ? 'fail' : 'dim'),
      blank(),
      kv([
        ['building', n.building.join('; ')],
        ['reading', n.reading.join('; ')],
        ['learning', n.learning.join('; ')],
      ]),
      ...(n.body.trim() ? [blank(), prose(n.body)] : []),
      blank(),
      line('the build fails at 90 days. staleness here is a bug, not a vibe.', 'dim'),
    ]
  },
}
