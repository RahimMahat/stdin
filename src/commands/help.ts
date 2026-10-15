import { blank, line, table, type Cell, type Out } from '../render/ast'
import { canonical, runnable } from './naming'
import type { Command, Ctx } from './types'

/**
 * Built as a factory rather than a module-level const: `help` needs the whole
 * registry, and the registry needs `help`. Passing the list in at assembly time
 * keeps that dependency one-directional.
 */
export function makeHelp(all: () => Command[]): Command {
  return {
    name: 'help',
    aliases: ['?', 'man'],
    summary: 'list every command',
    page: true,
    run(_ctx: Ctx): Out[] {
      const commands = all().filter((c) => !c.hidden)
      const rows: Cell[][] = commands.map((c) => [
        // Shows the usage line, runs the part without placeholders in it — but
        // only where that part does something worth a click. Bare `cat` is an
        // error and bare `grep` a usage line, so `cat` sends the reader to the
        // list it reads from and `grep` and `clear` stay plain text.
        { text: canonical(c), cmd: c.page ? runnable(c) : c.name === 'cat' ? 'ls projects/' : undefined },
        { text: c.summary, tone: 'dim' },
      ])
      const unpaged = commands.filter((c) => !c.page && c.name !== 'cat').map((c) => c.name)
      return [
        line(`${commands.length} commands. tab completes; anything unrecognised suggests the nearest match.`, 'dim'),
        blank(),
        table(['command', 'output'], rows),
        blank(),
        line(
          `each one with a fixed output is also a real page, and reads the same with javascript off; cat has one per project. ${unpaged.join(' and ')} depend on what you type, so they have none.`,
          'dim',
        ),
      ]
    },
  }
}
