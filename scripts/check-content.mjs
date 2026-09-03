#!/usr/bin/env node
/**
 * Fails while scaffolding text survives anywhere in the content layer.
 *
 * Run this before deploying. It is deliberately not part of `npm run build`,
 * because you need a working local build long before the copy is finished —
 * but nothing with a TODO marker in it should ever reach production.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOTS = ['src/content', 'src/data']
const MARKER = /TODO\s*[—-]/

async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (/\.(md|ts)$/.test(e.name)) yield p
  }
}

const hits = []
for (const root of ROOTS) {
  for await (const file of walk(root)) {
    const text = await readFile(file, 'utf8')
    text.split('\n').forEach((l, i) => {
      if (MARKER.test(l)) hits.push(`${relative('.', file)}:${i + 1}  ${l.trim().slice(0, 90)}`)
    })
  }
}

if (hits.length) {
  console.error(`\n${hits.length} placeholder${hits.length === 1 ? '' : 's'} still in content:\n`)
  for (const h of hits) console.error(`  ${h}`)
  console.error('\nFill these in before deploying.\n')
  process.exit(1)
}

console.log('content check passed — no placeholders remain.')
