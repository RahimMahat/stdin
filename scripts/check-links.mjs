#!/usr/bin/env node
/**
 * Verifies that every internal link in dist/ resolves to something that was
 * actually generated.
 *
 * This guards the load-bearing claim of the whole design: every command is a
 * real URL. A command chip pointing at a route that does not exist turns the
 * concept into a demo, and it is exactly the kind of break that only shows up
 * with JavaScript disabled — which is to say, never, during development.
 *
 * Run after `npm run build`.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const DIST = 'dist'

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else yield p
  }
}

const files = []
for await (const f of walk(DIST)) files.push(f)

/** Everything the server can serve, as a URL path. */
const routes = new Set()
for (const f of files) {
  const url = '/' + relative(DIST, f).split(sep).join('/')
  routes.add(url)
  if (url.endsWith('.html')) {
    const clean = url.slice(0, -'.html'.length)
    routes.add(clean === '/index' ? '/' : clean)
  }
}

const broken = new Set()
for (const f of files.filter((f) => f.endsWith('.html'))) {
  const html = await readFile(f, 'utf8')
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
    const target = m[1].replace(/\/$/, '') || '/'
    if (!routes.has(target)) broken.add(`${relative(DIST, f)}  ->  ${m[1]}`)
  }
}

if (broken.size) {
  console.error(`\n${broken.size} broken internal link${broken.size === 1 ? '' : 's'}:\n`)
  for (const b of [...broken].sort()) console.error(`  ${b}`)
  console.error('')
  process.exit(1)
}

console.log(`link check passed — ${routes.size} routes, no broken internal links.`)
