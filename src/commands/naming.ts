import type { Command } from './types'

/**
 * How a command is written down.
 *
 * Its own module, importing only a type, because `help` needs it and the
 * registry needs `help` — putting these in the registry would close a cycle
 * between the two. Everything else reaches them re-exported from `./index`.
 */

/** The canonical input line for a command — what `help` and the prompt display. */
export const canonical = (cmd: Command): string => cmd.usage ?? cmd.name

/**
 * The canonical line with placeholder tokens dropped, so it can actually be
 * run. `theme [dark|light]` displays well and errors when executed; this turns
 * it into `theme`, and `cat projects/<name>` into `cat`.
 *
 * Anything offered as a chip or as a suggestion goes through here. A suggestion
 * the shell then rejects is worse than no suggestion at all.
 */
export const runnable = (cmd: Command): string =>
  canonical(cmd)
    .split(/\s+/)
    .filter((t) => !/[<>[\]]/.test(t))
    .join(' ')
