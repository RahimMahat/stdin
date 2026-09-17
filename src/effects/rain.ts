/**
 * Makes the rain actually rain.
 *
 * The first version of this was CSS alone: fixed glyphs, a lit gradient band
 * travelling down each column. It was cheap and it was wrong. What reads as
 * cmatrix is not the moving light, it is the characters changing underneath
 * it — a column you have already read refusing to stay read.
 *
 * So this steps. Roughly sixteen frames a second, one row at a time, because
 * that is what a terminal does and smoothing it to 60fps makes it look like a
 * gradient again. At each step the head takes a new glyph and the tail fades
 * through three states, which is the whole effect.
 *
 * The split into per-character spans is deferred exactly the way
 * effects/matrix-name.ts defers its own: the served markup stays plain text,
 * so the document both renderers produce is identical and nothing here can
 * put them out of step.
 */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>[]{}/|=+*#%$&@?!;:~^'
const STEP_MS = 62
/** How many rows stay lit behind the head before the column goes dark. */
const TRAIL = 7

/**
 * Only the newest grid runs. Every `cmatrix` leaves a block behind in the
 * scrollback, and a screensaver that keeps painting four screens you have
 * already scrolled past is a battery bug wearing a costume.
 */
let stopPrevious: (() => void) | null = null

const reduced = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const glyph = (): string => GLYPHS[Math.floor(Math.random() * GLYPHS.length)] as string

interface Column {
  cells: HTMLElement[]
  /** Rows per step is always 1; this is how many steps to wait between moves. */
  every: number
  head: number
}

export function rain(root: ParentNode = document): void {
  for (const host of root.querySelectorAll<HTMLElement>('.rain:not([data-lit])')) {
    if (reduced()) {
      host.dataset.lit = 'still'
      continue
    }
    stopPrevious?.()
    host.dataset.lit = 'on'
    stopPrevious = start(host)
  }
}

function start(host: HTMLElement): () => void {
  const columns: Column[] = []

  for (const col of host.querySelectorAll<HTMLElement>('.rain-col')) {
    const text = col.textContent ?? ''
    const cells: HTMLElement[] = []

    col.textContent = ''
    for (const ch of text.split(String.fromCharCode(10))) {
      const s = document.createElement('span')
      s.className = 'rain-ch'
      s.textContent = ch
      cells.push(s)
      col.append(s, document.createTextNode(String.fromCharCode(10)))
    }

    columns.push({
      cells,
      // Uneven speeds, so neighbours never march in step.
      every: 1 + Math.floor(Math.random() * 3),
      // Staggered starts, and some columns begin above the top so the first
      // few steps are not a single flat row falling together.
      head: -Math.floor(Math.random() * (cells.length + TRAIL)),
    })
  }

  let step = 0
  let last = 0
  let raf = 0

  const frame = (now: number): void => {
    if (!host.isConnected) {
      cancelAnimationFrame(raf)
      return
    }

    if (now - last >= STEP_MS) {
      last = now
      step++

      for (const c of columns) {
        if (step % c.every !== 0) continue
        c.head++
        if (c.head - TRAIL > c.cells.length) c.head = -Math.floor(Math.random() * 6)

        c.cells.forEach((cell, row) => {
          const behind = c.head - row
          if (behind === 0) {
            // A new head is a new character. This is the bit that was missing.
            cell.textContent = glyph()
            cell.className = 'rain-ch head'
          } else if (behind > 0 && behind <= 2) {
            cell.className = 'rain-ch hot'
          } else if (behind > 2 && behind <= TRAIL) {
            cell.className = 'rain-ch warm'
          } else {
            cell.className = 'rain-ch'
          }
        })
      }
    }

    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    host.dataset.lit = 'done'
  }
}
