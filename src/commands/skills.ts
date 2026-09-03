import { blank, line, tree, type Out } from '../render/ast'
import { skills as skillTree } from '../data/skills'
import type { Command, Ctx } from './types'

export const skills: Command = {
  name: 'skills',
  summary: 'the stack, grouped by where it does work',
  usage: 'skills --tree',
  page: true,
  pageArgs: { flags: { tree: true } },
  run(_ctx: Ctx): Out[] {
    return [
      tree(skillTree),
      blank(),
      line('depth is the claim: each tool sits under the stage it actually serves.', 'dim'),
    ]
  },
}
