import { line, type Out } from '../render/ast'
import type { Command, Ctx } from './types'

/**
 * Intercepted by the shell, which owns the DOM. This body only runs where there
 * is nothing to clear — a search engine, or a visitor without JavaScript — so it
 * explains itself instead of pretending to have worked.
 */
export const clear: Command = {
  name: 'clear',
  aliases: ['cls'],
  summary: 'empty the screen (ctrl+L)',
  page: false,
  run(_ctx: Ctx): Out[] {
    return [line('clear: nothing to clear — this is a static page.', 'dim')]
  },
}
