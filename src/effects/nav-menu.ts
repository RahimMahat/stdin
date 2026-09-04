/**
 * The crumbs collapse to a single control on a narrow screen.
 *
 * Not a hamburger — three stacked lines are a metaphor from application chrome,
 * and this site has none. The control is the prompt sigil and a word, so it
 * reads as something you could have typed, and what it opens is the same
 * stacked list of destinations the landing page already prints.
 *
 * The button ships `hidden` and is revealed here, for exactly the reason the
 * prompt does in terminal/shell.ts: if this file never arrives, the visitor is
 * left with a working row of links rather than a button that does nothing.
 */

const NARROW = '(max-width: 640px)'

export function mountNavMenu(): void {
  const nav = document.querySelector('.crumbs')
  if (!(nav instanceof HTMLElement)) return

  const toggle = nav.querySelector('.nav-toggle')
  const links = nav.querySelector('.nav-links')
  if (!(toggle instanceof HTMLButtonElement) || !(links instanceof HTMLElement)) return

  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true'

  const setOpen = (open: boolean) => {
    nav.classList.toggle('open', open)
    toggle.setAttribute('aria-expanded', String(open))
  }

  /**
   * The row and the menu are the same six links; only the presentation moves.
   * `data-nav` on the root is what the stylesheet switches on, so the collapsed
   * state is described in one place rather than toggled property by property.
   */
  const sync = () => {
    const collapsed = window.matchMedia(NARROW).matches
    if (collapsed) document.documentElement.dataset.nav = 'menu'
    else delete document.documentElement.dataset.nav
    toggle.hidden = !collapsed
    if (!collapsed) setOpen(false)
  }

  toggle.addEventListener('click', () => setOpen(!isOpen()))

  // Escape closes and hands the focus back, matching the completion listbox.
  nav.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return
    setOpen(false)
    toggle.focus()
  })

  // A tap anywhere else dismisses it. Without this the panel outlives the
  // intent that opened it, which is the one thing every menu is judged on.
  document.addEventListener('click', (event) => {
    if (!nav.contains(event.target as Node)) setOpen(false)
  })

  window.matchMedia(NARROW).addEventListener('change', sync)
  sync()
}
