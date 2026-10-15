import { blank, kv, line, prose, type Out } from '../render/ast'
import { ymd } from './fmt'
import type { Command, Ctx } from './types'

export const now: Command = {
  name: 'now',
  summary: 'what he is building, reading and learning this month',
  page: true,
  run({ data }: Ctx): Out[] {
    const n = data.now
    return [
      // The date only, no "n days ago". The static page is rendered once, at
      // build, and served for up to ninety days after it; an age printed there
      // says 0 for all ninety, and disagrees with the same command typed live.
      line(`last updated ${ymd(n.updated)}`, 'dim'),
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
