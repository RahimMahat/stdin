#!/usr/bin/env node
/**
 * Drives the live shell in a real DOM.
 *
 * The terminal is the one part of this site that the build cannot prove
 * correct: `astro check` types it, and `check-links` proves the static half,
 * but nothing until here has actually pressed a key. This bundles the terminal
 * exactly as the browser gets it, mounts it against a built page, and drives it.
 *
 * The most valuable assertion is the last one — renderer parity. The whole
 * design rests on the claim that a command looks the same whether it was typed
 * or navigated to, and that claim is only true while two files agree.
 *
 * Run after `npm run build`.
 */
import { readFile, readdir } from 'node:fs/promises'
import * as esbuild from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import astroConfig from '../astro.config.mjs'

const results = []
const ok = (name) => results.push({ name, pass: true })
const bad = (name, detail) => results.push({ name, pass: false, detail })

function check(name, cond, detail = '') {
  cond ? ok(name) : bad(name, detail)
}

/* ---------------------------------------------------------------- */
/* bundle                                                            */
/* ---------------------------------------------------------------- */

// Compiled from source through esbuild's stdin entry, so the imports resolve
// against the repo rather than against a temp directory.
const built = await esbuild.build({
  stdin: {
    contents: `
      import { mount } from './src/terminal/shell'
      import { registry, runForPage, canonical, run } from './src/commands'
      import { renderStatic } from './src/render/static'
      import { renderLive } from './src/render/live'
      import { suggest } from './src/terminal/complete'
      import { pageFor } from './src/commands'
      import { matrixName } from './src/effects/matrix-name'
      window.__t = { mount, registry, runForPage, canonical, run, renderStatic, renderLive, suggest, matrixName, pageFor }
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  write: false,
  logLevel: 'silent',
})
const code = built.outputFiles[0].text

/* ---------------------------------------------------------------- */
/* mount                                                             */
/* ---------------------------------------------------------------- */

const page = await readFile('dist/whoami.html', 'utf8')
// Drop the real module script; the bundle above stands in for it.
const html = page.replace(/<script type="module"[^>]*><\/script>/g, '')
const siteJson = await readFile('dist/site.json', 'utf8')
const cssFile = (await readdir('dist/_astro')).find((f) => f.endsWith('.css'))
const css = await readFile(`dist/_astro/${cssFile}`, 'utf8')

// Surface anything a listener throws. Without this jsdom swallows it and the
// only symptom is an assertion failing for no visible reason.
const thrown = []
const virtualConsole = new VirtualConsole()
virtualConsole.on('jsdomError', (e) => thrown.push(e))

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://rahim-stdin.pages.dev/whoami',
  // Without this jsdom omits requestAnimationFrame, which the reveal needs.
  pretendToBeVisual: true,
  virtualConsole,
})
const { window } = dom
const doc = window.document

// Most assertions care about *what* was rendered, not how it arrived, so the
// reveal runs instantly. One test below flips this to exercise the animated path.
let reducedMotion = true
window.matchMedia = () => ({
  get matches() {
    return reducedMotion
  },
  addEventListener() {},
  removeEventListener() {},
})
let fetched = 0
window.fetch = async (url) => (
  fetched++,
  String(url).includes('site.json')
    ? { ok: true, status: 200, json: async () => JSON.parse(siteJson) }
    : { ok: false, status: 404, json: async () => ({}) })

window.eval(code)

const T = window.__t
const $ = (sel) => doc.querySelector(sel)

const key = (el, k, init = {}) =>
  el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))

const type = (el, value) => {
  el.value = value
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

const submit = (form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))

const settle = () => new Promise((r) => window.setTimeout(r, 60))

/** JSON has no dates; the command layer needs them back. Mirrors terminal/data.ts. */
function revive(raw) {
  return {
    ...raw,
    projects: raw.projects.map((p) => ({ ...p, started: new Date(p.started) })),
    roles: raw.roles.map((r) => ({
      ...r,
      start: new Date(r.start),
      end: r.end === null ? null : new Date(r.end),
    })),
    now: { ...raw.now, updated: new Date(raw.now.updated) },
  }
}

/* ---------------------------------------------------------------- */
/* drive                                                             */
/* ---------------------------------------------------------------- */

const data0 = revive(JSON.parse(siteJson))

/* --- the decorative prompt, which only the landing page has --- */
const landing = new JSDOM(await readFile('dist/index.html', 'utf8')).window.document
const ghost = landing.querySelector('.prompt-line.ghost')
check('landing page ships a decorative prompt for no-JS', !!ghost)
check('the decorative prompt is hidden from assistive tech', ghost?.getAttribute('aria-hidden') === 'true')
check('a command page echoes its command instead', !doc.querySelector('.prompt-line.ghost'))
check(
  'the echoed command survives',
  doc.querySelector('.prompt-line .typed')?.textContent === 'whoami',
  doc.querySelector('.prompt-line .typed')?.textContent,
)
// Quotes and spaces do not survive minification, so compare without them.
const cssNorm = css.replace(/['"\s]/g, '')
check(
  'the stylesheet hides the decorative prompt once a real one exists',
  cssNorm.includes('[data-shell=live].prompt-line.ghost{display:none'),
  'rule missing from the built stylesheet',
)
check('no live prompt is claimed before mount', !doc.documentElement.dataset.shell)

const form = $('#tty')
const input = $('#tty-in')
const listbox = $('#tty-ac')

check('form ships hidden', form.hidden === true, 'the no-JS visitor must not see a dead prompt')
check('input ships disabled', input.disabled === true)

T.mount()
check('form revealed on mount', form.hidden === false)
check('mount stands down the decorative prompt', doc.documentElement.dataset.shell === 'live')
check('payload is not fetched on mount', fetched === 0, `${fetched} requests`)

// Intent to type pulls the payload forward, ahead of the idle timer.
input.dispatchEvent(new window.Event('focus'))
await settle()
check('focus triggers the load', fetched === 1, `${fetched} requests`)
check('input enabled once data loaded', input.disabled === false, `placeholder: ${input.placeholder}`)

/* --- running a command --- */
type(input, 'ls projects/')
submit(form)
await settle()

const block = $('#stream .block')
check('command produced a block', !!block)
check('block echoes the prompt', block?.querySelector('.typed')?.textContent === 'ls projects/')
check('output is a live region', block?.querySelector('.out')?.getAttribute('aria-live') === 'polite')

const rows = block?.querySelectorAll('.tbl tbody tr') ?? []
check(
  'ls printed every project',
  rows.length === data0.projects.length,
  `${rows.length} rows for ${data0.projects.length} projects`,
)
check('url tracks the command', window.location.pathname === '/ls', window.location.pathname)
check('block is addressable for back/forward', block?.dataset.href === '/ls')

/* --- the animated path, which is what a real visitor gets --- */
reducedMotion = false
type(input, 'now')
submit(form)
const midway = doc.querySelectorAll('#stream .block:last-child .out > *').length
await new Promise((r) => window.setTimeout(r, 600))
const settled = doc.querySelectorAll('#stream .block:last-child .out > *').length
check('output streams in rather than appearing at once', midway < settled, `${midway} -> ${settled}`)
check('streamed output arrives complete', settled === T.run('now', data0).length, `${settled} nodes`)
reducedMotion = true

/* --- unknown command --- */
const urlBeforeError = window.location.pathname
type(input, 'sudo rm -rf /')
submit(form)
await settle()
const last = () => doc.querySelector('#stream .block:last-child')
check('unknown command fails politely', !!last()?.querySelector('.o-fail'))
check(
  'no roadmap language reaches a visitor',
  !doc.body.textContent.toLowerCase().includes('phase '),
  'internal phase numbering must not appear in page copy',
)
check(
  'unknown command leaves the url alone',
  window.location.pathname === urlBeforeError,
  `${urlBeforeError} -> ${window.location.pathname}`,
)
check('unknown command gets no shareable url', !last()?.dataset.href)

/* --- history --- */
const ran = ['ls projects/', 'now', 'sudo rm -rf /']

key(input, 'ArrowUp')
check('↑ recalls the last command', input.value === ran[2], input.value)
key(input, 'ArrowUp')
check('↑ walks further back', input.value === ran[1], input.value)
key(input, 'ArrowDown')
check('↓ walks forward again', input.value === ran[2], input.value)
key(input, 'ArrowDown')
check('↓ returns to the empty prompt', input.value === '', JSON.stringify(input.value))
check(
  'history persists to sessionStorage',
  JSON.stringify(JSON.parse(window.sessionStorage.getItem('stdin.history') || '[]')) ===
    JSON.stringify(ran),
  window.sessionStorage.getItem('stdin.history'),
)

/* --- completion --- */
input.value = ''
type(input, 'who')
check('listbox opens on input', listbox.hidden === false)
check('combobox announces expansion', input.getAttribute('aria-expanded') === 'true')
check('top suggestion is the obvious one', listbox.querySelector('.ac-name')?.textContent === 'whoami')
check('options are options', listbox.querySelector('li')?.getAttribute('role') === 'option')
check('matched characters are marked', !!listbox.querySelector('.ac-name b'))

key(input, 'ArrowDown')
check('arrow selects an option', listbox.querySelector('li')?.getAttribute('aria-selected') === 'true')
check('active descendant is set', input.getAttribute('aria-activedescendant') === 'tty-ac-0')

key(input, 'Enter')
check('enter accepts the active option', input.value === 'whoami', input.value)
check('list closes after accept', listbox.hidden === true)

const urlBeforeMiss = window.location.pathname
type(input, 'cat projects/nope')
submit(form)
await settle()
check(
  'a missing project does not fake a url',
  window.location.pathname === urlBeforeMiss,
  `${urlBeforeMiss} -> ${window.location.pathname}`,
)
check('a missing project reports itself', !!last()?.querySelector('.o-fail'))

type(input, 'cat projects/pl')
key(input, 'Tab')
check('tab completes a unique match', input.value === 'cat projects/platform', input.value)

type(input, 'the')
key(input, 'Escape')
check('escape closes the list', listbox.hidden === true)

/* --- ranking --- */
const ranked = T.suggest('th', data0)
check(
  'tight matches outrank scattered ones',
  ranked[0]?.value.startsWith('theme'),
  ranked.map((r) => r.value).join(' | '),
)

/* --- theme --- */
type(input, 'theme light')
submit(form)
await settle()
check('theme applies to the document', doc.documentElement.getAttribute('data-theme') === 'light')
check('theme persists', window.localStorage.getItem('stdin.theme') === 'light')
check(
  'theme confirms rather than explains',
  !!doc.querySelector('#stream .block:last-child .o-ok'),
)

type(input, 'theme')
submit(form)
await settle()
check('bare theme toggles back', doc.documentElement.getAttribute('data-theme') === 'dark')

/* --- chips run instead of navigating --- */
const before = doc.querySelectorAll('#stream .block').length
const chip = doc.querySelector('.out a[data-cmd]')
const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
chip.dispatchEvent(ev)
await settle()
check('chip click is intercepted', ev.defaultPrevented, `chip: ${chip?.dataset.cmd}`)
check('chip click runs the command', doc.querySelectorAll('#stream .block').length === before + 1)

/* --- clear --- */
type(input, 'clear')
submit(form)
await settle()
check('clear empties the session', doc.querySelectorAll('#stream .block').length === 0)

/* ---------------------------------------------------------------- */
/* unknown input suggests rather than scolds                         */
/* ---------------------------------------------------------------- */

const chipsOf = (nodes) => nodes.filter((n) => n.t === 'cmds').flatMap((n) => n.items.map((i) => i.name))

const typo = T.run('whoam', data0)
check('a near miss suggests the real command', chipsOf(typo).includes('whoami'), chipsOf(typo).join(' | '))

const nearProject = T.run('projct', data0)
check(
  'a near miss reaches project pages too',
  chipsOf(nearProject).some((c) => c.startsWith('cat projects/')),
  chipsOf(nearProject).join(' | '),
)

const nonsense = T.run('xyzzy', data0)
check('gibberish suggests nothing rather than anything', chipsOf(nonsense).length === 0, chipsOf(nonsense).join(' | '))
check('gibberish still points at help', nonsense.some((n) => n.t === 'line' && n.text.includes('help')))

/**
 * Every chip anywhere on the site must be executable. `theme [dark|light]` reads
 * well and errors when run, which is exactly the kind of thing that only shows
 * up when someone clicks it.
 */
const offered = new Set()
for (const cmd of T.registry) for (const c of chipsOf(T.runForPage(cmd, data0))) offered.add(c)
for (const probe of ['whoam', 'projct', 'thme', 'cat', 'ls -a'])
  for (const c of chipsOf(T.run(probe, data0))) offered.add(c)

// `cat .env` refuses on purpose — that is the joke, not a broken chip.
offered.delete('cat .env')

const unrunnable = [...offered].filter((c) => /[<>[\]]/.test(c))
check('nothing is ever offered that cannot be run', unrunnable.length === 0, unrunnable.join(' | '))

const rejected = [...offered].filter((c) => {
  const out = T.run(c, data0)
  return out.some((n) => n.t === 'line' && n.tone === 'fail')
})
check('no offered command comes back as an error', rejected.length === 0, rejected.join(' | '))

/* ---------------------------------------------------------------- */
/* the dotfiles                                                      */
/*                                                                   */
/* Staying hidden IS the feature, so most of these assert absence.   */
/* ---------------------------------------------------------------- */

const textOf = (nodes) =>
  nodes
    .map((n) =>
      n.t === 'line' ? n.text
      : n.t === 'cmds' ? n.items.map((i) => i.name).join(' ')
      : n.t === 'table' ? n.rows.flat().map((c) => `${c.text} ${c.cmd ?? ''}`).join(' ')
      : '',
    )
    .join(' ')

check('plain ls says nothing about dotfiles', !textOf(T.run('ls projects/', data0)).includes('.plan'))
check('ls -a reveals them', textOf(T.run('ls -a', data0)).includes('.plan'))
check('ls -la reveals them too', textOf(T.run('ls -la', data0)).includes('.plan'))
check('ls --all reveals them too', textOf(T.run('ls --all', data0)).includes('.plan'))

const plan = T.run('cat .plan', data0)
check('cat .plan reads the file', textOf(plan).includes('typed `ls -a` on a portfolio site'))
check('the file keeps its line breaks', plan.filter((n) => n.t === 'blank').length > 3)

const env = T.run('cat .env', data0)
check('cat .env refuses in character', textOf(env).includes('permission denied') && textOf(env).includes('nice try'))
check('an unknown dotfile is not invented', textOf(T.run('cat .nope', data0)).includes('no such file'))

// The three ways it could leak.
check('help never mentions a dotfile', !textOf(T.run('help', data0)).includes('.plan'))
check(
  'tab completion never offers a dotfile',
  !T.suggest('.', data0).some((s) => s.value.includes('.plan')) &&
    !T.suggest('plan', data0).some((s) => s.value.includes('.plan')),
)
check(
  'did-you-mean never offers a dotfile',
  !['pln', 'plan', 'env', 'bash'].some((q) => textOf(T.run(q, data0)).includes('.plan')),
)
check('a dotfile can never resolve to a url', T.pageFor('cat .plan') === null && T.pageFor('cat .env') === null)

// The one that matters: nothing crawlable ever contains it.
const builtPages = (await readdir('dist', { recursive: true })).filter((f) => String(f).endsWith('.html'))
const leaked = []
for (const f of builtPages) {
  if ((await readFile(`dist/${f}`, 'utf8')).includes('.plan')) leaked.push(String(f))
}
check('no built page leaks the dotfiles to a crawler', leaked.length === 0, leaked.join(', '))

/* ---------------------------------------------------------------- */
/* canonical urls                                                    */
/* ---------------------------------------------------------------- */

/**
 * Every page declares a canonical URL, and getting it wrong is invisible
 * locally: the site looks perfect while telling crawlers its real home is
 * somewhere else. Two ways it has already gone wrong once each — a host nobody
 * owns, and the .html form that the CDN redirects away from.
 */
const SITE = new URL(astroConfig.site)
const canonicals = []
for (const f of builtPages) {
  const html = await readFile(`dist/${f}`, 'utf8')
  const m = html.match(/<link rel="canonical" href="([^"]+)"/)
  if (m) canonicals.push([String(f), m[1]])
}

check('every built page declares a canonical', canonicals.length === builtPages.length,
  `${canonicals.length} of ${builtPages.length}`)

check(
  'every canonical points at the configured host',
  canonicals.every(([, href]) => new URL(href).origin === SITE.origin),
  canonicals.filter(([, h]) => new URL(h).origin !== SITE.origin).map(([f]) => f).join(', '),
)

const withExt = canonicals.filter(([, href]) => /\.html$/.test(href))
check('no canonical names the .html form the host redirects away from',
  withExt.length === 0, withExt.map(([f, h]) => `${f} -> ${h}`).join(', '))

const rootCanonical = canonicals.find(([f]) => f === 'index.html')
check('the root canonical is the bare origin, not /index',
  Boolean(rootCanonical) && rootCanonical[1] === `${SITE.origin}/`,
  rootCanonical ? rootCanonical[1] : 'missing')

/* ---------------------------------------------------------------- */
/* the masthead hover scramble                                       */
/* ---------------------------------------------------------------- */

/**
 * jsdom has no layout, so every rect is zero and the distance maths would be
 * meaningless. Character boxes are faked to a fixed 30px grid, which makes the
 * falloff exactly predictable: with RADIUS 2.4 the ripple reaches two
 * characters either side of the pointer and no further.
 */
async function scrambleRun({ hover = true, reduced = false, clientX = 75 }) {
  const d2 = new JSDOM(await readFile('dist/index.html', 'utf8'), {
    url: 'https://rahim-stdin.pages.dev/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const w = d2.window

  w.matchMedia = (q) => ({
    matches: q.includes('hover') ? hover : reduced,
    addEventListener() {},
    removeEventListener() {},
  })

  const W = 30
  w.Element.prototype.getBoundingClientRect = function () {
    if (!this.classList?.contains('g')) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }
    const i = [...this.parentElement.querySelectorAll('.g')].indexOf(this)
    return { left: i * W, right: i * W + W, width: W, top: 0, bottom: 60, height: 60 }
  }

  w.eval(code)
  const h1 = w.document.querySelector('.masthead .name')
  const before = w.document.querySelectorAll('.masthead .name .g').length

  w.__t.matrixName()

  const enter = new w.Event('pointerenter')
  enter.clientX = clientX
  enter.clientY = 30
  enter.pointerType = 'mouse'
  h1.dispatchEvent(enter)

  // Sample which characters ever light up across several TICK windows.
  const seen = new Set()
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => w.setTimeout(r, 16))
    w.document.querySelectorAll('.masthead .name .g.on').forEach((el) => {
      seen.add([...el.parentElement.querySelectorAll('.g')].indexOf(el))
    })
  }

  return { w, h1, before, seen, chars: [...w.document.querySelectorAll('.masthead .name .g')] }
}

const run1 = await scrambleRun({})
check('the resting heading is not split', run1.before === 0)
check('hover splits the name into characters', run1.chars.length === 10, `${run1.chars.length} chars`)
check('the real name moves to aria-label', run1.h1.getAttribute('aria-label') === 'Rahim Mahat')
check(
  'the fragments are hidden from assistive tech',
  run1.h1.firstElementChild?.getAttribute('aria-hidden') === 'true',
)
check('the character under the pointer scrambles', run1.seen.has(2), [...run1.seen].join(','))
check(
  'the ripple falls off and never reaches the far end',
  ![5, 6, 7, 8, 9].some((i) => run1.seen.has(i)),
  `lit: ${[...run1.seen].sort((a, b) => a - b).join(',')}`,
)
check(
  'a scrambled character keeps its own box',
  run1.chars.every((c) => c.textContent.length === 1),
  'the letter must stay put; only the overlay changes',
)
check(
  'the overlay glyph is a font both faces actually ship',
  run1.chars.every((c) => !c.dataset.glyph || /^[A-Z0-9<>[\]{}/|=+*#%$&@?!;:~^]$/.test(c.dataset.glyph)),
)

const leave = new run1.w.Event('pointerleave')
run1.h1.dispatchEvent(leave)
await new Promise((r) => run1.w.setTimeout(r, 40))
check(
  'leaving restores every letter',
  run1.w.document.querySelectorAll('.masthead .name .g.on').length === 0,
)

const reducedRun = await scrambleRun({ reduced: true })
check('reduced motion refuses to split at all', reducedRun.chars.length === 0)

const touchRun = await scrambleRun({ hover: false })
check('a device without hover refuses too', touchRun.chars.length === 0)

/* ---------------------------------------------------------------- */
/* renderer parity — the load-bearing one                            */
/* ---------------------------------------------------------------- */

const data = data0

/**
 * Both sides are parsed and re-serialized by the same parser before comparison,
 * and whitespace-only text nodes carrying a newline are dropped.
 *
 * Comparing raw strings does not work and should not. The build-time renderer
 * escapes `'` and `<` inside attributes where the DOM serializer does not, and
 * it joins blocks with newlines that the live renderer never creates. None of
 * that is visible in a browser. The claim under test is that the two produce
 * the same document, not the same bytes — so the comparison is made on the
 * documents.
 */
const throughDom = (html) => {
  const d = doc.createElement('div')
  d.innerHTML = html

  const walk = doc.createTreeWalker(d, 4 /* SHOW_TEXT */)
  const drop = []
  while (walk.nextNode()) {
    if (/^\s*\n\s*$/.test(walk.currentNode.nodeValue)) drop.push(walk.currentNode)
  }
  for (const n of drop) n.remove()

  return d.innerHTML
}

const mismatches = []
for (const cmd of T.registry) {
  const nodes = T.runForPage(cmd, data)

  const staticSide = throughDom(T.renderStatic(nodes))

  const liveHost = doc.createElement('div')
  liveHost.append(...T.renderLive(nodes))
  const liveSide = throughDom(liveHost.innerHTML)

  if (staticSide !== liveSide) {
    const at = [...staticSide].findIndex((c, i) => c !== liveSide[i])
    mismatches.push(
      `${cmd.name} (diverges at ${at})\n      static: …${staticSide.slice(Math.max(0, at - 30), at + 70)}\n      live:   …${liveSide.slice(Math.max(0, at - 30), at + 70)}`,
    )
  }
}
check(
  'every command renders identically in both renderers',
  mismatches.length === 0,
  mismatches.join('\n    '),
)

check('nothing threw during the session', thrown.length === 0, thrown.map((e) => e.stack ?? String(e)).join('\n    '))

/* ---------------------------------------------------------------- */

const failed = results.filter((r) => !r.pass)
for (const r of results) {
  console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.pass || !r.detail ? '' : `\n    ${r.detail}`}`)
}
console.log(`\n${results.length - failed.length}/${results.length} shell checks passed.`)
if (failed.length) process.exit(1)
