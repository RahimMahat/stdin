import { THEME_KEY } from '../commands/theme'

/**
 * The one side effect the command layer is not allowed to perform itself.
 *
 * `commands/theme.ts` decides what the output says; this decides what the page
 * does. Keeping them apart is what lets the same command render identically on
 * the static /theme page, where there is no DOM to mutate.
 */

export type Theme = 'dark' | 'light'

export const currentTheme = (): Theme =>
  document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'

export function applyTheme(arg?: string): Theme {
  const next: Theme =
    arg === 'light' || arg === 'dark' ? arg : currentTheme() === 'dark' ? 'light' : 'dark'

  document.documentElement.setAttribute('data-theme', next)
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    // Private mode. The change still applies for this page; it just will not
    // survive a reload, which is a better outcome than refusing to switch.
  }

  return next
}
