import { hrefFor } from '../commands'
import type { Cell, Out, Tone, TreeNode } from './ast'

/**
 * Build-time renderer. Turns the output AST into HTML strings for real pages.
 *
 * The live renderer (phase 2) emits the same class names against the same
 * stylesheet, so a command looks identical whether it was typed or navigated to.
 * Keep the markup here dumb and semantic — no wrapper divs that only exist for
 * styling, because the live renderer has to reproduce them exactly.
 */

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const tone = (t?: Tone): string => (t ? ` o-${t}` : '')

/** A cell becomes a link when it names a command, a page, or a URL. */
function cell(c: Cell): string {
  const body = esc(c.text)
  const cls = `cell${tone(c.tone)}`
  if (c.cmd) {
    return `<a class="${cls} chip" href="${esc(hrefFor(c.cmd))}" data-cmd="${esc(c.cmd)}">${body}</a>`
  }
  if (c.href) {
    const ext = /^https?:/.test(c.href)
    const rel = ext ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a class="${cls}" href="${esc(c.href)}"${rel}>${body}</a>`
  }
  return `<span class="${cls}">${body}</span>`
}

function treeRows(node: TreeNode, depth: number, isLast: boolean[], out: string[]): void {
  if (depth > 0) {
    const stem = isLast
      .slice(0, -1)
      .map((l) => (l ? '    ' : '│   '))
      .join('')
    const elbow = isLast[isLast.length - 1] ? '└── ' : '├── '
    const note = node.note ? `<span class="o-dim">  ${esc(node.note)}</span>` : ''
    out.push(`<div class="tree-row"><span class="stem">${stem}${elbow}</span>${esc(node.label)}${note}</div>`)
  } else {
    out.push(`<div class="tree-row tree-root">${esc(node.label)}</div>`)
  }
  const kids = node.children ?? []
  kids.forEach((k, i) => treeRows(k, depth + 1, [...isLast, i === kids.length - 1], out))
}

function node(n: Out): string {
  switch (n.t) {
    case 'line':
      return `<div class="line${tone(n.tone)}">${esc(n.text)}</div>`

    case 'blank':
      return `<div class="line blank">&nbsp;</div>`

    case 'rule':
      return `<hr class="out-rule">`

    case 'prose':
      // Already HTML — see data/site.ts. Both renderers wrap it identically.
      return `<div class="prose">${n.html}</div>`

    case 'kv':
      return `<dl class="kv">${n.pairs
        .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
        .join('')}</dl>`

    case 'table':
      return (
        `<div class="tbl"><table>` +
        `<thead><tr>${n.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` +
        `<tbody>${n.rows
          .map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody>` +
        `</table></div>`
      )

    case 'tree': {
      const rows: string[] = []
      treeRows(n.root, 0, [], rows)
      return `<div class="tree">${rows.join('')}</div>`
    }

    case 'log':
      return `<div class="log">${n.entries
        .map(
          (e) =>
            `<div class="commit${e.current ? ' current' : ''}">` +
            `<span class="hash">${esc(e.hash)}</span>` +
            `<span class="date">${esc(e.date)}</span>` +
            `<span class="subject">${esc(e.title)} <span class="o-dim">@ ${esc(e.org)}</span></span>` +
            `<span class="body">${esc(e.message)}</span>` +
            `</div>`,
        )
        .join('')}</div>`

    case 'cmds':
      return `<div class="cmds${n.grid ? ' grid' : ''}">${n.items
        .map(
          (i) =>
            `<a class="chip" href="${esc(hrefFor(i.name))}" data-cmd="${esc(i.name)}">` +
            `${esc(i.name)}${i.label ? `<span class="o-dim"> ${esc(i.label)}</span>` : ''}</a>`,
        )
        .join('')}</div>`

    case 'graph':
      // Phase 3. Until then a command may declare a graph and it renders as a
      // pointer rather than silently vanishing.
      return `<div class="line o-dim">[graph: ${n.def.nodes.length} nodes, not yet rendered]</div>`
  }
}

export function renderStatic(nodes: Out[]): string {
  return nodes.map(node).join('\n')
}

/** Plain-text rendering, for the &lt;meta name="description"&gt; of each command page. */
export function renderText(nodes: Out[], limit = 155): string {
  const parts: string[] = []
  for (const n of nodes) {
    if (n.t === 'line') parts.push(n.text)
    else if (n.t === 'prose') parts.push(n.html.replace(/<[^>]+>/g, ' '))
    else if (n.t === 'kv') parts.push(n.pairs.map(([k, v]) => `${k}: ${v}`).join(', '))
  }
  const s = parts.join(' ').replace(/\s+/g, ' ').trim()
  return s.length > limit ? `${s.slice(0, limit - 1).trimEnd()}…` : s
}
