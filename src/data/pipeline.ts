import type { GraphDef, GraphNode } from '../render/ast'

/**
 * Pipeline layout.
 *
 * Content authors lanes, not pixels: a node says which column of the pipeline
 * it belongs to and the order it sits in, and this resolves that into absolute
 * geometry exactly once, at build time. Renderers receive coordinates and draw
 * them. That split is not tidiness — it is the only reason the two renderers
 * cannot disagree about what the diagram looks like.
 */

/** The shape authored in project frontmatter, before layout. */
export interface PipelineSpec {
  nodes: {
    id: string
    label: string
    note?: string
    lane: number
    status?: 'ok' | 'fail' | 'running'
    cmd?: string
  }[]
  edges: { from: string; to: string; label?: string }[]
}

export const NODE_W = 116
export const NODE_H = 46
export const GAP_X = 48
const GAP_Y = 18
const PAD = 2

export function layout(spec: PipelineSpec, where: string): GraphDef {
  const seen = new Set<string>()
  for (const n of spec.nodes) {
    if (seen.has(n.id)) throw new Error(`${where}: two pipeline nodes share the id "${n.id}".`)
    seen.add(n.id)
  }

  const lane = new Map(spec.nodes.map((n) => [n.id, n.lane]))
  for (const e of spec.edges) {
    if (!seen.has(e.from)) throw new Error(`${where}: pipeline edge starts at unknown node "${e.from}".`)
    if (!seen.has(e.to)) throw new Error(`${where}: pipeline edge ends at unknown node "${e.to}".`)
    // Left to right, always. This is what makes the diagram acyclic by
    // construction and lets every edge route as a single elbow — a pipeline
    // that needs to point backwards is a pipeline drawn in the wrong order.
    if ((lane.get(e.to) as number) <= (lane.get(e.from) as number)) {
      throw new Error(
        `${where}: pipeline edge ${e.from} -> ${e.to} does not move forward a lane. Data flows left to right.`,
      )
    }
  }

  const touched = new Set(spec.edges.flatMap((e) => [e.from, e.to]))
  for (const n of spec.nodes) {
    if (!touched.has(n.id)) throw new Error(`${where}: pipeline node "${n.id}" has no edges. Connect it or cut it.`)
  }

  // Dense lane indices, so authors can number lanes 0/10/20 and still get
  // columns that touch.
  const lanes = [...new Set(spec.nodes.map((n) => n.lane))].sort((a, b) => a - b)
  const column = new Map(lanes.map((l, i) => [l, i]))

  const rows = new Map<number, GraphNode[]>()
  const nodes: GraphNode[] = spec.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    note: n.note,
    status: n.status ?? 'ok',
    cmd: n.cmd,
    x: 0,
    y: 0,
  }))
  spec.nodes.forEach((n, i) => {
    const list = rows.get(n.lane) ?? []
    list.push(nodes[i] as GraphNode)
    rows.set(n.lane, list)
  })

  const tallest = Math.max(...[...rows.values()].map((r) => r.length))
  const span = (count: number) => count * NODE_H + (count - 1) * GAP_Y
  const full = span(tallest)

  for (const [l, list] of rows) {
    const x = PAD + (column.get(l) as number) * (NODE_W + GAP_X)
    // Each column is centred against the tallest one, so a fan-out reads as a
    // fan rather than as everything hanging off the top edge.
    const top = PAD + Math.round((full - span(list.length)) / 2)
    list.forEach((n, i) => {
      n.x = x
      n.y = top + i * (NODE_H + GAP_Y)
    })
  }

  return {
    nodes,
    edges: spec.edges,
    width: PAD * 2 + lanes.length * NODE_W + (lanes.length - 1) * GAP_X,
    height: PAD * 2 + full,
  }
}
