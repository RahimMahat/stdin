import { hrefFor } from '../commands'
import { esc } from './esc'
import { GAP_X, NODE_H, NODE_W } from '../data/pipeline'
import type { GraphDef, GraphNode } from './ast'

/**
 * The pipeline diagram, as one SVG string.
 *
 * Both renderers call this and emit what it returns — the static one as markup,
 * the live one through `innerHTML`. That is deliberate. Every other node type is
 * written twice and held together by the parity check; this one is too much
 * geometry to write twice and get away with, so it is written once and the
 * parity check has nothing left to catch.
 *
 * Nothing here computes layout. Coordinates arrive resolved from
 * `data/pipeline.ts` and are used as given.
 */

const mid = (a: number, b: number): number => Math.round((a + b) / 2)

function box(n: GraphNode): string {
  const cx = n.x + NODE_W / 2
  const label = n.note
    ? `<text class="dag-label" x="${cx}" y="${n.y + 20}">${esc(n.label)}</text>` +
      `<text class="dag-note" x="${cx}" y="${n.y + 34}">${esc(n.note)}</text>`
    : `<text class="dag-label" x="${cx}" y="${n.y + 28}">${esc(n.label)}</text>`

  const body = `<rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="3"/>${label}`
  const cls = `dag-node dag-${n.status}`

  // A node that names a command behaves like every other chip on the site:
  // a real link at a real URL, which the terminal intercepts when it is running.
  if (n.cmd) {
    return `<a class="${cls}" href="${esc(hrefFor(n.cmd))}" data-cmd="${esc(n.cmd)}">${body}</a>`
  }
  return `<g class="${cls}">${body}</g>`
}

function edge(def: GraphDef, e: { from: string; to: string; label?: string }): string {
  const f = def.nodes.find((n) => n.id === e.from) as GraphNode
  const t = def.nodes.find((n) => n.id === e.to) as GraphNode

  const x1 = f.x + NODE_W
  const y1 = f.y + NODE_H / 2
  const x2 = t.x
  const y2 = t.y + NODE_H / 2

  // The turn happens in the gap immediately before the target, not at the
  // midpoint. For an edge between neighbouring lanes those are the same
  // point; for one that skips a lane it is the difference between running
  // the vertical segment down a corridor and running it through a box.
  const mx = x2 - GAP_X / 2
  const d = y1 === y2 ? `M${x1} ${y1} H${x2}` : `M${x1} ${y1} H${mx} V${y2} H${x2}`

  const path = `<path class="dag-edge" d="${d}" marker-end="url(#dag-arrow)"/>`
  if (!e.label) return path

  const lx = mid(x1, mx)
  return path + `<text class="dag-edge-label" x="${lx}" y="${y1 - 7}">${esc(e.label)}</text>`
}

export function dagSvg(def: GraphDef): string {
  const title = `pipeline: ${def.nodes.map((n) => n.label).join(', ')}`

  return (
    `<div class="dag">` +
    `<svg viewBox="0 0 ${def.width} ${def.height}" width="${def.width}" height="${def.height}">` +
    `<title>${esc(title)}</title>` +
    `<defs><marker id="dag-arrow" viewBox="0 0 8 8" refX="7" refY="4" ` +
    `markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z"/></marker></defs>` +
    def.edges.map((e) => edge(def, e)).join('') +
    def.nodes.map(box).join('') +
    `</svg></div>`
  )
}
