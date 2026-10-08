/**
 * Makes the rain actually rain, and makes it take the screen.
 *
 * The first version was CSS alone: fixed glyphs, a lit gradient band
 * travelling down each column. It was cheap and it was wrong. What reads as
 * cmatrix is not the moving light, it is the characters changing underneath
 * it — a column you have already read refusing to stay read.
 *
 * The second version was right about the glyphs and wrong about the frame. A
 * screensaver in a 36x12 box is a thumbnail of a screensaver. Real cmatrix
 * takes the whole terminal and hands it back on ^C, so that is what this does:
 * the served block is now only the artifact for a visitor who gets no overlay
 * — reduced motion, or no JavaScript at all — and everyone else gets the
 * viewport.
 *
 * The AST node is deliberately unchanged. A full-screen grid is sized from
 * `innerWidth`, which is a fact about the browser and not about the command,
 * so it cannot live in output that two renderers have to agree on. The node
 * stays a 36x12 seeded block; this file reads it as a cue, not as a grid.
 *
 * Still stepping at roughly sixteen frames a second, one row at a time,
 * because that is what a terminal does and smoothing it to 60fps makes it look
 * like a gradient again.
 */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>[]{}/|=+*#%$&@?!;:~^'
const NEWLINE = String.fromCharCode(10)
const STEP_MS = 62
/** How many rows stay lit behind the head before the column goes dark. */
const TRAIL = 7

/** On the way out the rain slows before it stops — ^C is a decision, not a cut. */
const EXIT_SLOW = 2.6
/** Must match the opacity transition on `.rain-full` in theme.css. */
const FADE_MS = 900

/** Glyph box. `--mono` advances 0.6em; 0.58 buys a column of slack if it never loads. */
const SIZE = 14
const ADVANCE = 0.58
const LINE = 1.15
/**
 * A 4K viewport is around 60k per-character spans, which costs more to lay out
 * than an easter egg is worth. Over budget the glyphs grow rather than the DOM.
 */
const BUDGET = 18000

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
    host.dataset.lit = 'full'
    stopPrevious = takeover(host)
  }
}

/** Returns an immediate teardown. The graceful one is `exit`, bound to ^C. */
function takeover(host: HTMLElement): () => void {
  const doc = host.ownerDocument
  const view = doc.defaultView
  if (!view || !doc.body) {
    host.dataset.lit = 'done'
    return () => {}
  }
  // `stop` and `exit` are hoisted declarations, so they are outside the
  // narrowing above and need the non-null binding rather than the union.
  const win: Window = view

  // Cell size first, because the grid is whatever fits at that size.
  const w = win.innerWidth || 1024
  const h = win.innerHeight || 768
  const rough = Math.ceil(w / (SIZE * ADVANCE)) * Math.ceil(h / (SIZE * LINE))
  const scale = rough > BUDGET ? Math.sqrt(rough / BUDGET) : 1
  const size = SIZE * scale
  // One spare of each, so a font that loads narrower than assumed cannot leave
  // an unpainted strip down the side.
  const cols = Math.ceil(w / (size * ADVANCE)) + 1
  const rows = Math.ceil(h / (size * LINE)) + 1

  const overlay = doc.createElement('div')
  overlay.className = 'rain-full'
  overlay.setAttribute('aria-hidden', 'true')
  if (scale !== 1) overlay.style.fontSize = `${size.toFixed(2)}px`

  const columns: Column[] = []
  for (let c = 0; c < cols; c++) {
    const col = doc.createElement('span')
    col.className = 'rain-col'
    const cells: HTMLElement[] = []

    for (let r = 0; r < rows; r++) {
      const s = doc.createElement('span')
      s.className = 'rain-ch'
      s.textContent = glyph()
      cells.push(s)
      col.append(s, doc.createTextNode(NEWLINE))
    }

    overlay.append(col)
    columns.push({
      cells,
      // Uneven speeds, so neighbours never march in step.
      every: 1 + Math.floor(Math.random() * 3),
      // Staggered starts, and most columns begin above the top, so the first
      // few steps are not one flat row falling together.
      head: -Math.floor(Math.random() * (rows + TRAIL)),
    })
  }

  // Nothing in here says how to leave, and a page that has gone black with no
  // way out is a bug however pretty it is.
  const hint = doc.createElement('div')
  hint.className = 'rain-exit'
  hint.textContent = 'ctrl+c to exit'
  overlay.append(hint)

  doc.body.append(overlay)
  doc.documentElement.dataset.rain = 'on'
  // Next frame, so the transition has an opacity to move away from.
  win.requestAnimationFrame(() => overlay.setAttribute('data-on', ''))

  let exiting = false
  let step = 0
  let last = 0
  let raf = 0
  let timer = 0

  const frame = (now: number): void => {
    // `clear` took the block this belongs to. Give the screen back rather than
    // painting over a session that no longer exists.
    if (!host.isConnected && !exiting) {
      exit()
      return
    }

    if (now - last >= (exiting ? STEP_MS * EXIT_SLOW : STEP_MS)) {
      last = now
      step++

      for (const c of columns) {
        if (step % c.every !== 0) continue
        if (c.head - TRAIL > c.cells.length) {
          // On the way out a drained column stays drained. That is what makes
          // the rain thin out instead of cutting to black.
          if (exiting) continue
          c.head = -Math.floor(Math.random() * 6)
        }
        c.head++

        // Only the band around the head can have changed class since the last
        // step. At full screen the difference between this and walking every
        // row is eight writes per column against a hundred and thirty.
        for (let row = c.head - TRAIL - 1; row <= c.head; row++) {
          const cell = c.cells[row]
          if (!cell) continue
          const behind = c.head - row
          if (behind === 0) {
            // A new head is a new character. This is the bit that was missing.
            cell.textContent = glyph()
            cell.className = 'rain-ch head'
          } else if (behind <= 2) {
            cell.className = 'rain-ch hot'
          } else if (behind <= TRAIL) {
            cell.className = 'rain-ch warm'
          } else {
            cell.className = 'rain-ch'
          }
        }
      }
    }

    raf = win.requestAnimationFrame(frame)
  }

  const onKey = (e: KeyboardEvent): void => {
    const quit = e.key === 'Escape' || e.key === 'q' || (e.ctrlKey && e.key.toLowerCase() === 'c')
    if (!quit) return
    // Captured before the shell sees it, so `q` does not also land in the
    // input sitting behind the overlay.
    e.preventDefault()
    e.stopPropagation()
    exit()
  }

  function stop(): void {
    win.cancelAnimationFrame(raf)
    win.clearTimeout(timer)
    overlay.remove()
    delete doc.documentElement.dataset.rain
    doc.removeEventListener('keydown', onKey, true)
    host.dataset.lit = 'done'
    if (stopPrevious === stop) stopPrevious = null
  }

  /** The graceful one: the rain slows, thins out, and fades with the screen. */
  function exit(): void {
    if (exiting) return
    exiting = true
    overlay.removeAttribute('data-on')
    timer = win.setTimeout(stop, FADE_MS)
  }

  doc.addEventListener('keydown', onKey, true)
  overlay.addEventListener('click', exit)

  raf = win.requestAnimationFrame(frame)
  return stop
}
