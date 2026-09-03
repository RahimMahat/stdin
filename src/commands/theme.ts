import { blank, cmds, line, type Out } from '../render/ast'
import type { Command, Ctx } from './types'

export const THEME_KEY = 'stdin.theme'

/**
 * Theme is a command, not a switch in the corner.
 *
 * Dark is the hard default — not `prefers-color-scheme`, a default. A visitor
 * who wants paper asks for it, and the choice is then pinned in localStorage.
 * Putting a toggle in the chrome would be the one piece of navigation this site
 * spends its whole argument claiming not to have.
 */
export const theme: Command = {
  name: 'theme',
  summary: 'switch between dark (default) and light',
  usage: 'theme [dark|light]',
  page: true,
  run({ args }: Ctx): Out[] {
    const want = (args[0] ?? '').toLowerCase()

    if (want && want !== 'dark' && want !== 'light' && want !== 'toggle') {
      return [
        line(`theme: unknown theme "${want}"`, 'fail'),
        line('usage: theme [dark|light]', 'dim'),
      ]
    }

    // An explicit choice confirms rather than explains. The DOM side of this
    // lives in terminal/theme-dom.ts — commands stay pure so that this same
    // function can render the static /theme page during the build.
    if (want === 'dark' || want === 'light') {
      return [
        line(`theme → ${want}`, 'ok'),
        line('persisted. bare `theme` flips back.', 'dim'),
      ]
    }

    return [
      line('dark is the default. light is the warm paper from the original brief.', 'dim'),
      blank(),
      cmds([
        { name: 'theme dark', label: 'deep slate — default' },
        { name: 'theme light', label: 'warm paper' },
      ]),
      blank(),
      line('bare `theme` flips whichever is active. the choice persists across visits.', 'dim'),
    ]
  },
}
