import { hrefFor } from '../commands'
import type { Cell, Out, Tone, TreeNode } from './ast'

/**
 * Live renderer. Builds real DOM nodes for output that was typed rather than
 * navigated to.
 *
 * The contract with `render/static.ts` is that both produce the *same* element
 * tree and the same class names against the same stylesheet — a command has to
 * look identical whether the visitor typed it or arrived at its URL. When you
 * change markup in one, change it in the other.
 *
 * Everything here builds nodes through the DOM API and assigns text through
 * `textContent`. The single exception is `prose`, which is trusted HTML that
 * this repo generated at build time from its own content files.
 */

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}

const tone = (t?: Tone): string => (t ? ` o-${t}` : '')

function cell(c: Cell): HTMLElement {
  const cls = `cell${tone(c.tone)}`

  if (c.cmd) {
    const a = el('a', `${cls} chip`, c.text)
    a.href = hrefFor(c.cmd)
    a.dataset.cmd = c.cmd
    return a
  }

  if (c.href) {
    const a = el('a', cls, c.text)
    a.href = c.href
    if (/^https?:/.test(c.href)) {
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
    }
    return a
  }

  return el('span', cls, c.text)
}

function treeRows(node: TreeNode, depth: number, isLast: boolean[], out: HTMLElement[]): void {
  if (depth > 0) {
    const stem =
      isLast
        .slice(0, -1)
        .map((l) => (l ? '    ' : '│   '))
        .join('') + (isLast[isLast.length - 1] ? '└── ' : '├── ')

    const row = el('div', 'tree-row')
    row.append(el('span', 'stem', stem), document.createTextNode(node.label))
    if (node.note) row.append(el('span', 'o-dim', `  ${node.note}`))
    out.push(row)
  } else {
    out.push(el('div', 'tree-row tree-root', node.label))
  }

  const kids = node.children ?? []
  kids.forEach((k, i) => treeRows(k, depth + 1, [...isLast, i === kids.length - 1], out))
}

/** One AST node -> one block element, matching render/static.ts exactly. */
export function renderNode(n: Out): HTMLElement {
  switch (n.t) {
    case 'line':
      return el('div', `line${tone(n.tone)}`, n.text)

    case 'blank': {
      const d = el('div', 'line blank')
      d.innerHTML = '&nbsp;'
      return d
    }

    case 'rule':
      return el('hr', 'out-rule')

    case 'prose': {
      const d = el('div', 'prose')
      // Trusted: generated at build time by marked, from this repo's own
      // content collections. Nothing a visitor types ever reaches this branch.
      d.innerHTML = n.html
      return d
    }

    case 'kv': {
      const dl = el('dl', 'kv')
      for (const [k, v] of n.pairs) dl.append(el('dt', undefined, k), el('dd', undefined, v))
      return dl
    }

    case 'table': {
      const wrap = el('div', 'tbl')
      const t = el('table')
      const thead = el('thead')
      const hrow = el('tr')
      for (const c of n.cols) hrow.append(el('th', undefined, c))
      thead.append(hrow)

      const tbody = el('tbody')
      for (const r of n.rows) {
        const tr = el('tr')
        for (const c of r) {
          const td = el('td')
          td.append(cell(c))
          tr.append(td)
        }
        tbody.append(tr)
      }

      t.append(thead, tbody)
      wrap.append(t)
      return wrap
    }

    case 'tree': {
      const wrap = el('div', 'tree')
      const rows: HTMLElement[] = []
      treeRows(n.root, 0, [], rows)
      wrap.append(...rows)
      return wrap
    }

    case 'log': {
      const wrap = el('div', 'log')
      for (const e of n.entries) {
        const c = el('div', `commit${e.current ? ' current' : ''}`)
        const subject = el('span', 'subject', `${e.title} `)
        subject.append(el('span', 'o-dim', `@ ${e.org}`))
        c.append(el('span', 'hash', e.hash), el('span', 'date', e.date), subject, el('span', 'body', e.message))
        wrap.append(c)
      }
      return wrap
    }

    case 'cmds': {
      const wrap = el('div', `cmds${n.grid ? ' grid' : ''}`)
      for (const i of n.items) {
        const a = el('a', 'chip', i.name)
        a.href = hrefFor(i.name)
        a.dataset.cmd = i.name
        if (i.label) a.append(el('span', 'o-dim', ` ${i.label}`))
        wrap.append(a)
      }
      return wrap
    }

    case 'graph':
      return el('div', 'line o-dim', `[graph: ${n.def.nodes.length} nodes, not yet rendered]`)
  }
}

export function renderLive(nodes: Out[]): HTMLElement[] {
  return nodes.map(renderNode)
}
