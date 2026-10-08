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

/**
 * How much of a column stays lit behind the head, as a fraction of its height,
 * rolled per column so the streaks are not all the same length.
 *
 * Proportional and not a row count, which is the mistake the first full-screen
 * cut made: seven rows was tuned against a twelve-row box, where it covered
 * most of the column. Carried onto a fifty-row screen unchanged, the same
 * seven rows became a stub falling through empty space, and the whole thing
 * read as thin.
 */
const TRAIL_MIN = 0.3
const TRAIL_VARY = 0.35

/**
 * Where the trail steps down, as fractions of its own length. Four bands over
 * a long streak rather than the three a short one needed — at this length a
 * single flat tier stops reading as a fading tail and starts reading as a bar.
 */
const HOT = 0.14
const WARM = 0.45
const FADE = 0.72

/** On the way out the rain slows before it stops — ^C is a decision, not a cut. */
const EXIT_SLOW = 2.6
/** Must match the opacity transition on `.rain-full` in theme.css. */
const FADE_MS = 900

/**
 * Glyph box. Both are applied to the overlay as inline style and are the only
 * place the cell size is stated — see the note where the overlay is built.
 * 0.6em is the nominal advance of `--mono`, used only when there is no layout
 * to measure.
 */
const SIZE = 16
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
  /** Rows lit behind the head. Rolled per column — see TRAIL_MIN. */
  trail: number
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

  const overlay = doc.createElement('div')
  overlay.className = 'rain-full'
  overlay.setAttribute('aria-hidden', 'true')
  // Both halves of the cell size are set here and nowhere else. theme.css
  // deliberately declares neither: the first cut had the size in the sheet and
  // the grid arithmetic in this file, they disagreed by 2px, and the overlay
  // came up 77px short of the bottom of the screen.
  overlay.style.fontSize = `${SIZE}px`
  overlay.style.lineHeight = String(LINE)

  // And measure the cell rather than assume it, because the advance is a fact
  // about whichever font actually loaded. A hardcoded 0.58em against a
  // fallback that advances 0.55 leaves an unpainted strip down the side.
  const probe = doc.createElement('span')
  probe.className = 'rain-col'
  // Not stretched: the overlay is a flex row, so a probe left to `align-items:
  // stretch` reports the height of the window rather than of two lines of text.
  probe.style.alignSelf = 'flex-start'
  probe.textContent = `M${NEWLINE}M`
  overlay.append(probe)
  doc.body.append(overlay)
  const box = probe.getBoundingClientRect()
  probe.remove()
  // jsdom has no layout and returns zeros. Fall back to the nominal metrics.
  const cw = box.width || SIZE * 0.6
  const ch = box.height / 2 || SIZE * LINE

  const w = win.innerWidth || 1024
  const h = win.innerHeight || 768
  const rough = Math.ceil(w / cw) * Math.ceil(h / ch)
  const scale = rough > BUDGET ? Math.sqrt(rough / BUDGET) : 1
  if (scale !== 1) overlay.style.fontSize = `${(SIZE * scale).toFixed(2)}px`
  // One spare of each, so a rounding cannot leave the last row half-painted.
  const cols = Math.ceil(w / (cw * scale)) + 1
  const rows = Math.ceil(h / (ch * scale)) + 1

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
    const trail = Math.round(rows * (TRAIL_MIN + Math.random() * TRAIL_VARY))
    columns.push({
      cells,
      trail,
      // Uneven speeds, so neighbours never march in step.
      every: 1 + Math.floor(Math.random() * 3),
      // Heads start scattered *inside* the screen, not above it. Starting them
      // all above staggers nicely but takes the better part of ten seconds to
      // reach the bottom row, which means the fade-in plays over a screen that
      // is still mostly empty. A column below its own trail is still dark, so
      // this costs nothing and skips straight to steady state.
      head: Math.floor(Math.random() * (rows + trail)) - trail,
    })
  }

  // Nothing in here says how to leave, and a page that has gone black with no
  // way out is a bug however pretty it is.
  const hint = doc.createElement('div')
  hint.className = 'rain-exit'
  hint.textContent = 'ctrl+c to exit'
  overlay.append(hint)

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
        if (c.head - c.trail > c.cells.length) {
          // On the way out a drained column stays drained. That is what makes
          // the rain thin out instead of cutting to black.
          if (exiting) continue
          c.head = -Math.floor(Math.random() * 6)
        }
        c.head++

        const hot = Math.max(2, c.trail * HOT)
        const warm = c.trail * WARM
        const fade = c.trail * FADE

        // Only the trail can have changed since the last step, and within it
        // only the handful of cells that crossed a band boundary — so the walk
        // is the trail and the write is guarded. At 1080p that is around five
        // writes a column rather than the sixty the walk alone would be.
        for (let row = c.head - c.trail - 1; row <= c.head; row++) {
          const cell = c.cells[row]
          if (!cell) continue
          const behind = c.head - row
          if (behind === 0) {
            // A new head is a new character. This is the bit that was missing.
            cell.textContent = glyph()
            cell.className = 'rain-ch head'
            continue
          }
          const cls =
            behind <= hot
              ? 'rain-ch hot'
              : behind <= warm
                ? 'rain-ch warm'
                : behind <= fade
                  ? 'rain-ch fade'
                  : behind <= c.trail
                    ? 'rain-ch dim'
                    : 'rain-ch'
          if (cell.className !== cls) cell.className = cls
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
