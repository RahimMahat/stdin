import { blank, line, rain, type Out } from '../render/ast'
import type { Command, Ctx } from './types'

/**
 * cmatrix, unscoped.
 *
 * `effects/matrix-name.ts` runs this same idea inside one heading, a letter at
 * a time, and its header calls itself "cmatrix, scoped to whichever letter the
 * pointer is over". This is the version that is not scoped to anything.
 *
 * The glyphs never change once printed — only the lit band travels down each
 * column, and that is CSS. A JS loop rewriting 432 characters at 30fps would
 * buy a effect most people would not be able to name, at the cost of the only
 * animation on this site that currently costs nothing to run.
 *
 * Hidden: no page, absent from `help`, but left in the candidate list, so it
 * surfaces for anyone already typing toward it.
 */

const COLS = 36
const ROWS = 12

/** The set from effects/matrix-name.ts — latin, because neither face ships katakana. */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>[]{}/|=+*#%$&@?!;:~^'

/**
 * Seeded, so the grid is a fact about the command rather than about when it
 * ran. Two renderers handed the same node must produce the same document, and
 * `Math.random()` is the one way to make that untrue.
 */
function columns(): string[] {
  let seed = 0x5eed
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  const out: string[] = []
  for (let c = 0; c < COLS; c++) {
    let col = ''
    for (let r = 0; r < ROWS; r++) col += GLYPHS[Math.floor(next() * GLYPHS.length)]
    out.push(col)
  }
  return out
}

export const cmatrix: Command = {
  name: 'cmatrix',
  summary: 'the screensaver, obviously',
  hidden: true,
  page: false,
  run(_ctx: Ctx): Out[] {
    return [line('follow the white rabbit.', 'dim'), blank(), rain(columns())]
  },
}
