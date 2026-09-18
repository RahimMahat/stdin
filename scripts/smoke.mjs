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
      import { find } from './src/commands'
      import { rain } from './src/effects/rain'
      import { pageFor } from './src/commands'
      import { matrixName } from './src/effects/matrix-name'
      import { bootSequence } from './src/effects/boot'
      window.__t = { mount, registry, runForPage, canonical, run, renderStatic, renderLive, suggest, matrixName, pageFor, find, rain, bootSequence }
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
/* discovery: robots, the sitemap, and the card                      */
/* ---------------------------------------------------------------- */

/**
 * The site was live, correct, and completely unfindable by name for weeks.
 * Nothing was blocking a crawler; nothing had ever told one the site existed.
 * Being indexable and being discovered are different properties, and the
 * second one has no symptom you can see locally — every page loads perfectly
 * while no search engine has a reason to fetch any of them.
 *
 * Most of the fix is off-site and cannot be tested from here. These guard the
 * half the repository owns: that the two files a crawler looks for exist, that
 * the sitemap agrees with what was actually built, and that a link to this
 * site unfurls as something rather than as a bare URL.
 */

const readOr = async (p, enc) => {
  try {
    return await readFile(p, enc)
  } catch {
    return enc ? '' : Buffer.alloc(0)
  }
}

/* ---- robots.txt ---- */

/**
 * Shipped rather than left to the host. Cloudflare Pages answers /robots.txt
 * for projects that do not ship one, and what it serves is the content-signals
 * preamble: a page of comments, no directives, and no sitemap line.
 */
const robotsTxt = await readOr('dist/robots.txt', 'utf8')
check('dist ships robots.txt', robotsTxt.length > 0)
check(
  'robots.txt lets every crawler in',
  /^User-agent:\s*\*$/m.test(robotsTxt) && /^Allow:\s*\/$/m.test(robotsTxt),
)
check(
  'robots.txt disallows nothing',
  !/^Disallow:\s*\S/m.test(robotsTxt),
  'a stray Disallow here is one line away from deindexing the site',
)
check(
  'robots.txt names the sitemap at the configured host',
  robotsTxt.includes(`Sitemap: ${SITE.origin}/sitemap.xml`),
  robotsTxt.match(/^Sitemap:.*$/m)?.[0] ?? 'no Sitemap line',
)

/* ---- sitemap.xml ---- */

const sitemapXml = await readOr('dist/sitemap.xml', 'utf8')
check('dist ships sitemap.xml', sitemapXml.length > 0)
check(
  'the sitemap is a well-formed urlset',
  sitemapXml.startsWith('<?xml') &&
    sitemapXml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">') &&
    sitemapXml.trimEnd().endsWith('</urlset>'),
)

const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
check('the sitemap lists something', locs.length > 0)
check(
  'every sitemap URL is on the configured host',
  locs.every((l) => new URL(l).origin === SITE.origin),
  locs.filter((l) => new URL(l).origin !== SITE.origin).join(', '),
)
check(
  'no sitemap URL names the .html form the host redirects away from',
  !locs.some((l) => /\.html$/.test(l)),
  locs.filter((l) => /\.html$/.test(l)).join(', '),
)

// Both directions. A sitemap that misses a page is a page nobody finds; one
// that names a page that was never built is a 404 handed to a crawler, and
// enough of those and it stops trusting the file at all.
const indexable = builtPages
  .filter((f) => String(f) !== '404.html')
  .map((f) => {
    const u = '/' + String(f).split('\\').join('/')
    return u === '/index.html' ? '/' : u.replace(/\.html$/, '')
  })
const listed = new Set(locs.map((l) => new URL(l).pathname))
const unlisted = indexable.filter((p) => !listed.has(p))
const phantom = [...listed].filter((p) => !indexable.includes(p))
check('every page that was built is in the sitemap', unlisted.length === 0, unlisted.join(', '))
check('and the sitemap names nothing that was not', phantom.length === 0, phantom.join(', '))

check('the sitemap keeps the 404 out', !listed.has('/404'))

// The same rule the rest of the suite enforces on pages and URLs: staying
// hidden is the feature, and a sitemap is the most direct way to undo it.
check(
  'the sitemap keeps the hidden command and the dotfiles out',
  !sitemapXml.includes('cmatrix') && !sitemapXml.includes('.plan'),
)

/* ---- the social card ---- */

/**
 * Not a ranking signal, and not here for one. A link posted anywhere renders
 * as a card or as a bare URL, and which of those it is decides whether anyone
 * clicks it — which is the only lever the site itself has on ever being
 * linked to. The dimensions matter: platforms silently drop an image that is
 * the wrong shape, which looks exactly like having no image at all.
 */
const ogPng = await readOr('dist/og.png')
check('dist ships the social card', ogPng.length > 0, `${ogPng.length} bytes`)
const ogW = ogPng.length > 24 ? ogPng.readUInt32BE(16) : 0
const ogH = ogPng.length > 24 ? ogPng.readUInt32BE(20) : 0
check('the card is the 1200x630 every platform expects', ogW === 1200 && ogH === 630, `${ogW}x${ogH}`)

const SOCIAL = ['og:url', 'og:site_name', 'og:title', 'og:description', 'og:image', 'twitter:card']
const socialGaps = []
const ogUrlMismatch = []
const relativeCards = []
for (const f of builtPages) {
  const html = await readFile(`dist/${f}`, 'utf8')
  for (const k of SOCIAL) if (!html.includes(`"${k}"`)) socialGaps.push(`${f}:${k}`)

  const canon = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
  const ogUrl = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1]
  if (canon !== ogUrl) ogUrlMismatch.push(`${f}: ${canon} vs ${ogUrl}`)

  const img = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? ''
  if (!img.startsWith(SITE.origin)) relativeCards.push(`${f}: ${img}`)
}
check('every page carries the card tags', socialGaps.length === 0, socialGaps.join(', '))
check(
  'og:url and the canonical never disagree',
  ogUrlMismatch.length === 0,
  ogUrlMismatch.join(', '),
)
check(
  'og:image is absolute — a relative one resolves against the scraper, not the site',
  relativeCards.length === 0,
  relativeCards.join(', '),
)

/* ---- the Person node ---- */

/**
 * The entity signal, and the reason any of this might move a search for the
 * name rather than for the site. "Rahim Mahat" is not a rare string: without
 * `sameAs` naming the LinkedIn and GitHub profiles, there is nothing tying
 * this site to the person a searcher meant, and the profile the engine already
 * trusts wins by default.
 *
 * It belongs on the pages that are about him and nowhere else, and every
 * mention has to carry the same @id or three pages describe three strangers.
 */
const ABOUT_HIM = ['index.html', 'resume.html', 'whoami.html']
const carrying = []
const ids = new Set()
let sameAs = []
let unparsed = []
for (const f of builtPages) {
  const html = await readFile(`dist/${f}`, 'utf8')
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  if (!m) continue
  carrying.push(String(f))
  let graph
  try {
    graph = JSON.parse(m[1])['@graph'] ?? []
  } catch {
    unparsed.push(String(f))
    continue
  }
  const person = graph.find((n) => n['@type'] === 'Person')
  if (person) {
    ids.add(person['@id'])
    sameAs = person.sameAs ?? []
  }
}
check('every ld+json block is valid JSON', unparsed.length === 0, unparsed.join(', '))
check(
  'the Person node is on the three pages that are about him',
  carrying.sort().join(', ') === ABOUT_HIM.join(', '),
  carrying.join(', '),
)
check('and all three mentions are one entity', ids.size === 1, [...ids].join(', '))
check(
  'the Person node names both profiles, which is what ties the name to the site',
  sameAs.some((u) => u.includes('linkedin.com')) && sameAs.some((u) => u.includes('github.com')),
  sameAs.join(', '),
)

// og:type says `profile` where a person is described and `website` elsewhere.
// A machine-readable claim that /theme is a biography is worse than a generic one.
const wrongType = []
for (const f of builtPages) {
  const html = await readFile(`dist/${f}`, 'utf8')
  const t = html.match(/<meta property="og:type" content="([^"]+)"/)?.[1]
  const expected = ABOUT_HIM.includes(String(f)) ? 'profile' : 'website'
  if (t !== expected) wrongType.push(`${f}: ${t}`)
}
check('og:type claims a profile only where one is described', wrongType.length === 0, wrongType.join(', '))

/* ---------------------------------------------------------------- */
/* headings                                                          */
/* ---------------------------------------------------------------- */

/**
 * Twelve of the thirteen pages used to render zero <h1> elements, including
 * /resume — the page the skip link goes to. Someone navigating by heading
 * arrived at a CV with nothing to navigate by, and it was invisible in every
 * check that only looked at whether a page rendered.
 *
 * The heading is the echoed command, so it is text that was already on the
 * page rather than a title invented to satisfy a validator. Three ways that
 * can regress: the h1 disappears, a second one appears, or the PS1 gets
 * swallowed into it.
 */
const headings = []
for (const f of builtPages) {
  // Astro ships HTML comments, and the ones in Shell.astro discuss the heading
  // by name. Strip them first or the source comment counts as a heading.
  const html = (await readFile(`dist/${f}`, 'utf8')).replace(/<!--[\s\S]*?-->/g, '')
  headings.push([String(f), [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1])])
}

const headless = headings.filter(([, hs]) => hs.length === 0)
check('every built page declares an h1', headless.length === 0, headless.map(([f]) => f).join(', '))

const doubled = headings.filter(([, hs]) => hs.length > 1)
check('and never more than one', doubled.length === 0, doubled.map(([f]) => f).join(', '))

const lsHeading = headings.find(([f]) => f === 'ls.html')
check('a command page is headed by its command', lsHeading?.[1][0] === 'ls projects/', lsHeading?.[1].join(' | '))

const projectHeading = headings.find(([f]) => String(f).endsWith('ingest.html'))
check('a project page too', projectHeading?.[1][0] === 'cat projects/ingest', projectHeading?.[1].join(' | '))

const landingHeading = headings.find(([f]) => f === 'index.html')
check(
  'the landing page keeps the name as its heading',
  landingHeading?.[1][0] === 'Rahim Mahat',
  landingHeading?.[1].join(' | '),
)

check(
  'the prompt is never read as the heading',
  headings.every(([, hs]) => hs.every((h) => !h.includes('rahim@stdin'))),
  'the PS1 is not what the page is called',
)

/*
 * It is a semantic claim, not a visual one — the line has to go on reading as
 * shell output. Without the reset a browser gives it 2em bold and a margin.
 *
 * Matched as a parsed rule rather than as a literal, because the minifier is
 * free to group these selectors with any others sharing the declaration, and
 * the claim under test is that the reset reaches both — not how it was
 * written down.
 */
const headingReset = cssNorm.match(/(?:^|})([^{}]*h1\.typed[^{}]*)\{([^}]*)\}/)
check(
  'the heading gives up every default a browser would give it',
  Boolean(headingReset) &&
    headingReset[1].includes('h1.typed') &&
    headingReset[1].includes('h1.line') &&
    headingReset[2].includes('font:inherit') &&
    headingReset[2].includes('margin:0'),
  headingReset ? `${headingReset[1]}{${headingReset[2]}}` : 'no rule resets h1.typed',
)

// And the session must not invent a second one: the echo the shell writes for
// each command it runs is a span, so a long session stays single-headed.
type(input, 'skills --tree')
submit(form)
await settle()
check(
  'a command run in the session adds no second heading',
  doc.querySelectorAll('h1').length === 1,
  `${doc.querySelectorAll('h1').length} after running a command`,
)

/* ---------------------------------------------------------------- */
/* the 404                                                           */
/* ---------------------------------------------------------------- */

/**
 * Without a top-level 404.html, Cloudflare Pages answers a missing route with
 * `200` and a bare host page. That is invisible in development — the dev
 * server has its own — and it fails in both directions at once: a crawler
 * indexes a page that says nothing, and a reader who dropped a character gets
 * a dead end.
 *
 * Verified by content rather than by status code, for the reason in CLAUDE.md:
 * Pages returns 200 with an HTML body for things that are not there, so a
 * status check reports success for a file that was never deployed.
 */
const notFound = builtPages.includes('404.html') ? await readFile('dist/404.html', 'utf8') : ''
check('dist ships a 404 page', notFound.length > 0, 'Pages serves a top-level 404.html and nothing else')

const notFoundHeading = headings.find(([f]) => f === '404.html')
check(
  'the 404 is headed by what went wrong',
  notFoundHeading?.[1][0] === '404 — no such file or directory',
  notFoundHeading?.[1].join(' | ') ?? 'no heading',
)

// It stands in for every missing path, so it cannot name the one that was
// asked for — and must not print a prompt suggesting anybody typed anything.
check(
  'the 404 claims no command was typed',
  !notFound.includes('class="typed"'),
  'one static file answers every missing path; it cannot echo one of them',
)

const waysOut = ['/whoami', '/ls', '/skills', '/git', '/now', '/contact'].filter(
  (href) => !notFound.includes(`href="${href}"`),
)
check('the 404 is a way back in, not a dead end', waysOut.length === 0, `missing: ${waysOut.join(', ')}`)

check('the 404 is kept out of the index', /<meta name="robots" content="noindex"/.test(notFound))

// The inverse is the one that would actually hurt: noindex is a single
// attribute away from deindexing the whole site, and nothing else would notice.
const noindexed = []
for (const f of builtPages) {
  if (String(f) === '404.html') continue
  if ((await readFile(`dist/${f}`, 'utf8')).includes('name="robots"')) noindexed.push(String(f))
}
check('and it is the only page that is', noindexed.length === 0, noindexed.join(', '))

/* ---------------------------------------------------------------- */
/* the favicon set                                                   */
/* ---------------------------------------------------------------- */

/**
 * A missing favicon is invisible in every test that only reads HTML — the tab
 * just renders the browser's blank page glyph. These assert the files actually
 * ship and that every page points at them.
 */
const iconFiles = ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']
for (const f of iconFiles) {
  let bytes = 0
  try {
    bytes = (await readFile(`dist/${f}`)).length
  } catch {
    /* left at 0 — the check below reports it */
  }
  check(`dist ships ${f}`, bytes > 0, `${bytes} bytes`)
}

const iconRefs = [
  ['svg icon', '<link rel="icon" href="/favicon.svg"'],
  ['ico fallback', '<link rel="icon" href="/favicon.ico"'],
  ['apple touch icon', '<link rel="apple-touch-icon" href="/apple-touch-icon.png"'],
  ['theme colour', '<meta name="theme-color" content="#14161d"'],
]
for (const [label, needle] of iconRefs) {
  const missing = []
  for (const f of builtPages) {
    const html = await readFile(`dist/${f}`, 'utf8')
    if (!html.includes(needle)) missing.push(String(f))
  }
  check(`every page declares the ${label}`, missing.length === 0, missing.join(', '))
}

/* The .svg is hand-written and the raster set is generated, so the two can
   drift apart silently. Pin the geometry they are supposed to share. */
const svg = await readFile('dist/favicon.svg', 'utf8')
check('the svg mark uses the accent colour', svg.includes('#e8a33d'))
check('the svg tile uses the dark ground', svg.includes('#14161d'))
check(
  'the svg caret keeps the 1:2.17 ratio of .caret',
  svg.includes('width="7.68" height="16.64"'),
  svg.slice(0, 200),
)

/* ---------------------------------------------------------------- */
/* the crumbs on a phone                                             */
/* ---------------------------------------------------------------- */

/**
 * jsdom has no layout engine, so none of this can measure a rendered row.
 * What it can do is hold the *budget*: the row is only one line on a phone
 * because the labels are short enough to fit, and the thing that breaks that
 * is someone adding a seventh destination a year from now.
 */
const crumbDoc = new JSDOM(await readFile('dist/whoami.html', 'utf8')).window.document
const crumbLinks = [...crumbDoc.querySelectorAll('.crumbs a')]

check('the crumbs are a labelled nav', crumbDoc.querySelector('nav.crumbs[aria-label]') !== null)

/* The landing page prints this same list as a grid, with a line of explanation
   under each. Two copies of one nav is what this removes. */
const landingHtml = await readFile('dist/index.html', 'utf8')
check(
  'the landing page prints no crumb row',
  !landingHtml.includes('class="crumbs"'),
  'its own output already is the list of destinations',
)
const crumbless = []
for (const f of builtPages) {
  if (String(f) === 'index.html') continue
  const html = await readFile(`dist/${f}`, 'utf8')
  if (!html.includes('class="crumbs"')) crumbless.push(String(f))
}
check(
  'every other page keeps it — it is their only way around',
  crumbless.length === 0,
  crumbless.join(', '),
)

/**
 * Removing the crumbs from the landing page took its top spacing with them —
 * the row was the only thing holding the masthead off the viewport edge. These
 * hold the replacement in place.
 */
check(
  'the page is held off the top edge',
  cssNorm.includes('padding:44px24px96px'),
  'the body must not start at y=0 — nothing else provides that gap',
)
check('and on a phone too', cssNorm.includes('body{padding:28px16px72px'))

check(
  'the landing page carries the site mark',
  landingHtml.includes('class="sitemark"'),
  'it stands where the crumb row stands elsewhere',
)
const marked = []
for (const f of builtPages) {
  if (String(f) === 'index.html') continue
  const html = await readFile(`dist/${f}`, 'utf8')
  if (html.includes('class="sitemark"')) marked.push(String(f))
}
check('and no other page does — the crumbs hold that line', marked.length === 0, marked.join(', '))
check(
  'the mark reuses the caret, not a second shape',
  cssNorm.includes('.sitemark.blk{width:8px;height:15px;background:var(--accent)'),
)
check(
  'the mark stops blinking when motion is refused',
  cssNorm.includes('.sitemark.blk{animation:none'),
)
check(
  'the home crumb has a spoken name, not "tilde"',
  crumbLinks[0]?.getAttribute('aria-label') === 'home',
  crumbLinks[0]?.outerHTML,
)

/* JetBrains Mono advances 0.6em; the crumbs sit at 13px with 7px of padding
   a side. A 360px phone leaves 342px once the body padding and the row's
   negative margin are accounted for. */
const CH = 13 * 0.6
const PAD = 14
const BUDGET = 342
const mobileWidth = crumbLinks.reduce((total, a) => {
  const arg = a.querySelector('.crumb-arg')
  const shown = a.textContent.length - (arg ? arg.textContent.length : 0)
  return total + Math.max(shown * CH + PAD, a.getAttribute('href') === '/' ? 40 : 0)
}, 0)
check(
  `the crumbs fit one row on a 360px phone (${Math.round(mobileWidth)}px of ${BUDGET})`,
  mobileWidth <= BUDGET,
  'shorten a label or drop a destination',
)
check(
  'the argument halves are droppable',
  crumbDoc.querySelectorAll('.crumbs .crumb-arg').length === 2,
  `${crumbDoc.querySelectorAll('.crumbs .crumb-arg').length} found`,
)

/* The rules that make the above true live in the stylesheet, not the markup. */
check('the narrow breakpoint drops the argument halves', cssNorm.includes('.crumb-arg{display:none'))
check('the crumbs get a padded hit area', cssNorm.includes('.crumbsa{padding:10px7px'))
check('the home crumb gets a floor width', cssNorm.includes('min-width:40px'))


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

/* ---------------------------------------------------------------- */
/* cmatrix — hidden, but not so hidden it cannot be reached          */
/* ---------------------------------------------------------------- */

/**
 * The bargain: absent from `help` and from every URL, but left in the one
 * candidate list that completion and did-you-mean both read. A secret the
 * prompt will not complete is a secret nobody finds; a secret `help` prints
 * is not one. The parity loop already runs it, because it is in the registry
 * and takes no arguments.
 */
const cmat = T.find('cmatrix')
check('cmatrix is registered', !!cmat)
check('cmatrix has no page of its own', cmat?.page === false, `page: ${cmat?.page}`)

const helpText = doc.createElement('div')
helpText.innerHTML = T.renderStatic(T.run('help', data0))
check(
  'help does not list the hidden command',
  !helpText.textContent.includes('cmatrix'),
)

check(
  'the prompt still completes it once you are typing toward it',
  T.suggest('cmat', data0).some((s) => s.value === 'cmatrix'),
  T.suggest('cmat', data0).map((s) => s.value).join(' | '),
)

const rainHost = doc.createElement('div')
rainHost.innerHTML = T.renderStatic(T.run('cmatrix', data0))
const rainEl = rainHost.querySelector('.rain')
check('cmatrix prints a rain block', !!rainEl)
check(
  'the rain is hidden from assistive tech',
  rainEl?.getAttribute('aria-hidden') === 'true',
)
check(
  'every column carries glyphs rather than an empty box',
  [...rainHost.querySelectorAll('.rain-col')].every((c) => c.textContent.trim().length > 0),
)

/**
 * The grid is seeded, not rolled. Two renderers handed the same node must
 * produce the same document, and Math.random() is the one way to make that
 * quietly untrue — it would pass a single parity run and fail in a browser.
 */
check(
  'the rain is seeded, not random',
  JSON.stringify(T.run('cmatrix', data0)) === JSON.stringify(T.run('cmatrix', data0)),
)

/**
 * The first cut of this was CSS alone — fixed glyphs under a moving gradient.
 * It passed every check above and still read as a lit band rather than as
 * rain, because what makes cmatrix cmatrix is the characters changing. So the
 * claim under test is not "something moves", it is "the glyphs are not the
 * ones we served".
 */
/** Column text with the newline nodes removed, so both sides compare alike. */
const flat = (h) => [...h.querySelectorAll('.rain-col')].map((c) => c.textContent.split(String.fromCharCode(10)).join('')).join('')

async function rainRun({ reduced = false } = {}) {
  const d3 = new JSDOM('<!doctype html><div id="h"></div>', {
    url: 'https://rahim-stdin.pages.dev/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const w = d3.window
  w.matchMedia = () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} })
  w.eval(code)

  const host = w.document.getElementById('h')
  host.innerHTML = w.__t.renderStatic(w.__t.run('cmatrix', data0))
  const served = flat(host)

  w.__t.rain(host)
  return { w, host, served }
}

const still = await rainRun({ reduced: true })
check(
  'refused motion leaves the grid still rather than empty',
  still.host.querySelector('.rain')?.dataset.lit === 'still' &&
    still.host.querySelectorAll('.rain-ch').length === 0,
)
still.w.close()

const wet = await rainRun()
check(
  'the rain splits into characters when it starts',
  wet.host.querySelectorAll('.rain-ch').length === 36 * 12,
  `${wet.host.querySelectorAll(".rain-ch").length} cells`,
)

await new Promise((r) => wet.w.setTimeout(r, 500))
const litClasses = [...wet.host.querySelectorAll('.rain-ch')].map((c) => c.className)
check(
  'a head and a trail are lit',
  litClasses.some((c) => c.includes('head')) && litClasses.some((c) => c.includes('warm')),
)

const after = flat(wet.host)
check(
  'the glyphs cycle rather than sitting under a moving light',
  after !== wet.served,
  'not one character changed in 500ms',
)

// A second grid stands the first one down, rather than leaving both painting.
wet.host.insertAdjacentHTML('beforeend', wet.w.__t.renderStatic(wet.w.__t.run('cmatrix', data0)))
wet.w.__t.rain(wet.host)
check(
  'only the newest grid keeps painting',
  wet.host.querySelectorAll('.rain[data-lit="on"]').length === 1 &&
    wet.host.querySelectorAll('.rain[data-lit="done"]').length === 1,
)
wet.w.close()

/* ---------------------------------------------------------------- */
/* the boot log                                                      */
/* ---------------------------------------------------------------- */

/**
 * A fake boot sequence is theatre. These check it is not one: every number
 * printed has to match the thing it claims to have counted, or the line is a
 * prop and should not be on the site at all.
 */
/**
 * Read out of the build rather than out of the live document: `clear` empties
 * the block this lives in, and a guard that reads a DOM the session has been
 * driving is a guard that passes on an empty string.
 */
const indexHtml = await readFile('dist/index.html', 'utf8')
const bootOpen = indexHtml.indexOf('<script id="boot-log"')
const bootGt = bootOpen < 0 ? -1 : indexHtml.indexOf('>', bootOpen)
const bootEnd = bootGt < 0 ? -1 : indexHtml.indexOf('</script>', bootGt)
check('the landing page embeds a boot log', bootOpen >= 0 && bootEnd > bootGt)

const bootLines = bootEnd > 0 ? JSON.parse(indexHtml.slice(bootGt + 1, bootEnd)) : []
const bootText = bootLines.join(' | ')
check('the boot log is not empty', bootLines.length > 0, bootText)

check(
  'no other page carries it',
  !(await readFile('dist/whoami.html', 'utf8')).includes('boot-log'),
)

check(
  'no visitor without javascript is shown a machine booting',
  !indexHtml.includes('class="boot'),
)

check(
  'the boot log counts the projects that actually loaded',
  bootText.includes(`${data0.projects.length} projects`),
  bootText,
)
check(
  'and the roles',
  bootText.includes(`${data0.roles.length} roles`),
  bootText,
)

/**
 * The date is the day `now/` stops satisfying the staleness rule and the
 * build starts failing — the one line here that is a promise about the
 * future rather than a report about the present.
 */
const expiry = new Date(data0.now.updated.getTime() + 90 * 86_400_000)
const expiryYmd = expiry.toISOString().slice(0, 10)
check(
  'the boot log names the day now/ expires',
  bootText.includes(expiryYmd),
  `expected ${expiryYmd} in: ${bootText}`,
)

const pkgVersion = JSON.parse(await readFile('package.json', 'utf8')).version
check(
  'the version is the one in package.json',
  bootText.includes(`v${pkgVersion}`),
  `expected v${pkgVersion} in: ${bootText}`,
)

/* --- behaviour --- */

async function bootRun({ reduced = false } = {}) {
  const d4 = new JSDOM(await readFile('dist/index.html', 'utf8'), {
    url: 'https://rahim-stdin.pages.dev/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const w = d4.window
  w.matchMedia = () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} })
  w.eval(code)
  return w
}

const printed = (w) => w.document.querySelectorAll('.boot .boot-line').length

const first = await bootRun()
first.__t.bootSequence()

/**
 * It must not hold the prompt hostage: the call returns with the block
 * started and unfinished, the same bargain terminal/stream.ts makes.
 */
const immediately = printed(first)
await new Promise((r) => first.setTimeout(r, 900))
const eventually = printed(first)

check('the boot log plays on a first visit', eventually === bootLines.length, `${eventually} of ${bootLines.length}`)
check(
  'it prints over time rather than blocking on its own animation',
  immediately < eventually,
  `${immediately} -> ${eventually}`,
)

// Same window, so the flag it just wrote is still there.
first.document.querySelector('.boot')?.remove()
first.__t.bootSequence()
check(
  'it does not play again for someone who has already seen it',
  printed(first) === 0,
  `${printed(first)} lines on a repeat visit`,
)
first.close()

const stillBoot = await bootRun({ reduced: true })
stillBoot.__t.bootSequence()
check(
  'refused motion prints it whole instead of stepping',
  printed(stillBoot) === bootLines.length,
  `${printed(stillBoot)} of ${bootLines.length}`,
)
stillBoot.close()

const impatient = await bootRun()
impatient.__t.bootSequence()
impatient.document.dispatchEvent(new impatient.KeyboardEvent('keydown', { key: 'a', bubbles: true }))
check(
  'a keypress lands the rest at once',
  printed(impatient) === bootLines.length,
  `${printed(impatient)} of ${bootLines.length}`,
)
impatient.close()

check('nothing threw during the session', thrown.length === 0, thrown.map((e) => e.stack ?? String(e)).join('\n    '))

/* ---------------------------------------------------------------- */

const failed = results.filter((r) => !r.pass)
for (const r of results) {
  console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.pass || !r.detail ? '' : `\n    ${r.detail}`}`)
}
console.log(`\n${results.length - failed.length}/${results.length} shell checks passed.`)
if (failed.length) process.exit(1)
