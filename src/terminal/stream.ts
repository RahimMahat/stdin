/**
 * Progressive reveal of command output.
 *
 * One requestAnimationFrame loop for the whole run, not a timer per node — the
 * cost of the effect should not scale with how much a command printed.
 *
 * Two things switch it off entirely: `prefers-reduced-motion`, and the visitor
 * running another command before this one finishes. In both cases every
 * remaining node is appended in a single frame, so the output is never
 * *withheld* — the animation only ever changes when finished content arrives,
 * never whether it does.
 */

const STEP_MS = 34

export interface Stream {
  /** Resolves when everything has been appended. */
  done: Promise<void>
  /** Append the remainder immediately. Safe to call after completion. */
  flush(): void
}

const reduced = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function stream(host: HTMLElement, nodes: HTMLElement[], onAppend?: () => void): Stream {
  let i = 0
  let raf = 0
  let settle: () => void = () => {}
  const done = new Promise<void>((res) => (settle = res))

  const appendRest = (): void => {
    if (i < nodes.length) {
      host.append(...nodes.slice(i))
      i = nodes.length
      onAppend?.()
    }
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    settle()
  }

  if (reduced() || nodes.length === 0) {
    appendRest()
    return { done, flush: appendRest }
  }

  let last = 0
  const tick = (now: number): void => {
    if (now - last >= STEP_MS) {
      last = now
      host.append(nodes[i++])
      onAppend?.()
    }
    if (i >= nodes.length) {
      raf = 0
      settle()
      return
    }
    raf = requestAnimationFrame(tick)
  }

  raf = requestAnimationFrame(tick)
  return { done, flush: appendRest }
}
