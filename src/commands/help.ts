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
      const commands = all()
      const rows: Cell[][] = commands.map((c) => [
        // Shows the usage line, runs the part without placeholders in it.
        { text: canonical(c), cmd: runnable(c) },
        { text: c.summary, tone: 'dim' },
      ])
      return [
        line(`${commands.length} commands. tab completes; anything unrecognised suggests the nearest match.`, 'dim'),
        blank(),
        table(['command', 'output'], rows),
        blank(),
        line('every one of these is also a real URL. /whoami works with javascript off.', 'dim'),
      ]
    },
  }
}
