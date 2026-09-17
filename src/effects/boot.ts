/**
 * The boot log.
 *
 * A fake boot sequence is theatre, and theatre on an engineer's site reads as
 * exactly what it is. So none of this is invented: the version is the one in
 * package.json, the counts are the collections that actually loaded, and the
 * date is the day `now/` stops satisfying the staleness rule and the build
 * starts failing. Lines the build can verify are the only lines here.
 *
 * It never blocks the prompt. The input is live the whole time this is
 * printing, and the first key or click flushes the rest in one frame — the
 * same bargain terminal/stream.ts makes, for the same reason: an effect may
 * change when finished content arrives, never whether it does.
 */

const KEY = 'stdin.booted'
const STEP_MS = 130
const OK = '[  ok  ] '

const reduced = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function bootSequence(): void {
  const host = document.querySelector<HTMLElement>('#stream')
  const src = document.querySelector<HTMLScriptElement>('#boot-log')
  if (!host || !src) return

  let lines: string[] = []
  try {
    lines = JSON.parse(src.textContent ?? '[]') as string[]
  } catch {
    return
  }
  if (lines.length === 0) return

  // Once per visitor. A flourish that plays every time is not a flourish, it is
  // a toll — and the person who pays it most is whoever is building the site.
  try {
    if (localStorage.getItem(KEY) === '1') return
    localStorage.setItem(KEY, '1')
  } catch {
    // Private window, storage disabled. Play it; there is nowhere to remember.
  }

  const wrap = document.createElement('div')
  wrap.className = 'boot'
  // Decorative: every fact printed here is also stated somewhere a reader can
  // reach without waiting for an animation to finish.
  wrap.setAttribute('aria-hidden', 'true')
  host.prepend(wrap)

  const els = lines.map((text) => {
    const el = document.createElement('div')
    el.className = 'boot-line'
    if (text.startsWith(OK)) {
      const tag = document.createElement('span')
      tag.className = 'boot-ok'
      tag.textContent = OK.trimEnd()
      el.append(tag, document.createTextNode(' ' + text.slice(OK.length)))
    } else {
      el.textContent = text
    }
    return el
  })

  if (reduced()) {
    wrap.append(...els)
    return
  }

  let i = 0
  let timer = 0

  const stop = (): void => {
    document.removeEventListener('keydown', flush)
    document.removeEventListener('pointerdown', flush)
  }

  function flush(): void {
    if (i < els.length) wrap.append(...els.slice(i))
    i = els.length
    if (timer) clearTimeout(timer)
    timer = 0
    stop()
  }

  const tick = (): void => {
    if (i >= els.length) {
      stop()
      return
    }
    wrap.append(els[i++] as HTMLElement)
    timer = window.setTimeout(tick, STEP_MS)
  }

  document.addEventListener('keydown', flush)
  document.addEventListener('pointerdown', flush)
  tick()
}
