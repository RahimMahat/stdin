/**
 * cmatrix, scoped to whichever letter the pointer is over.
 *
 * Three constraints shaped this more than the effect itself did:
 *
 * 1. **No layout shift.** The name is a proportional serif at display size.
 *    Swapping a letter for a wider glyph would shove the rest of the line
 *    sideways sixty times a second. So the original letter keeps its box and
 *    goes transparent, and the scrambled glyph is drawn over it by a
 *    pseudo-element — which cannot affect layout by construction.
 *
 * 2. **No tofu.** Katakana is the obvious choice and the wrong one: neither
 *    Newsreader nor JetBrains Mono ships it, so it would render as fallback
 *    glyphs or empty boxes. The set below is latin, digits and symbols, which
 *    both fonts definitely have. The effect comes from the cycling, not the
 *    alphabet.
 *
 * 3. **No damage to the heading.** Splitting an `<h1>` into per-character spans
 *    can make screen readers spell it out. The split is deferred to first hover
 *    (so the resting page is untouched and perfectly kerned), the fragments are
 *    hidden from assistive tech, and the real name moves to `aria-label`.
 */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>[]{}/|=+*#%$&@?!;:~^'

/** How far the ripple reaches, in multiples of a character's width. */
const RADIUS = 2.4
/** Milliseconds between glyph changes. Faster than this reads as noise. */
const TICK = 45

interface Box {
  mid: number
  top: number
  bottom: number
  w: number
}

export function matrixName(): void {
  const h1 = document.querySelector<HTMLElement>('.masthead .name')
  if (!h1) return

  // A device without hover can never trigger this, and someone who has asked
  // for less motion has asked for exactly this to not happen.
  if (!matchMedia('(hover: hover)').matches) return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  let chars: HTMLElement[] | null = null
  let boxes: Box[] = []
  let raf = 0
  let last = 0
  let px = 0
  let py = 0

  function split(): HTMLElement[] {
    const text = h1!.textContent ?? ''
    const wrap = document.createElement('span')
    wrap.setAttribute('aria-hidden', 'true')
    const out: HTMLElement[] = []

    for (const ch of text) {
      // Spaces stay as text nodes so the line can still wrap normally.
      if (ch === ' ') {
        wrap.append(ch)
        continue
      }
      const s = document.createElement('span')
      s.className = 'g'
      s.textContent = ch
      wrap.append(s)
      out.push(s)
    }

    h1!.setAttribute('aria-label', text)
    h1!.replaceChildren(wrap)
    return out
  }

  function measure(): void {
    boxes = (chars ?? []).map((c) => {
      const r = c.getBoundingClientRect()
      return { mid: r.left + r.width / 2, top: r.top, bottom: r.bottom, w: r.width }
    })
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    if (now - last < TICK) return
    last = now

    const unit = boxes.reduce((a, b) => a + b.w, 0) / (boxes.length || 1)
    if (!unit) return // no layout yet — nothing meaningful to measure against

    chars!.forEach((el, i) => {
      const b = boxes[i]
      // Vertical distance counts only once the pointer leaves the line's band,
      // so moving along the word does not fade the effect in and out.
      const dy = py < b.top ? b.top - py : py > b.bottom ? py - b.bottom : 0
      const d = Math.hypot(px - b.mid, dy) / unit
      const intensity = 1 - d / RADIUS

      if (intensity > 0.05 && Math.random() < intensity) {
        el.dataset.glyph = GLYPHS[(Math.random() * GLYPHS.length) | 0]
        el.classList.add('on')
      } else {
        el.classList.remove('on')
      }
    })
  }

  function stop(): void {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    for (const c of chars ?? []) c.classList.remove('on')
  }

  h1.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return
    chars ??= split()
    px = e.clientX
    py = e.clientY
    measure()
    if (!raf) {
      last = 0
      raf = requestAnimationFrame(frame)
    }
  })

  h1.addEventListener('pointermove', (e) => {
    px = e.clientX
    py = e.clientY
  })

  h1.addEventListener('pointerleave', stop)

  // Viewport-relative boxes go stale the moment anything moves.
  addEventListener('scroll', () => raf && measure(), { passive: true })
  addEventListener('resize', () => chars && measure())
}
