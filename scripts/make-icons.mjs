/**
 * Renders the favicon set. No dependencies — the icon is two shapes, so a
 * scanline sampler is less code than pulling in a rasterizer.
 *
 * The mark is the site's own caret: the amber block from .caret, on the dark
 * ground. Anything with lettering in it dissolves at 16px, and the cursor is
 * the honest symbol for a site named stdin — it is where input goes.
 *
 * Run after changing the geometry here or in public/favicon.svg; the two are
 * kept identical by hand and scripts/smoke.mjs checks that they agree.
 */
import { deflateSync, crc32 } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const GROUND = [0x14, 0x16, 0x1d]
const ACCENT = [0xe8, 0xa3, 0x3d]

/* Unit-square geometry, so every size renders from one source of truth. */
const RADIUS = 0.22
const CURSOR = { w: 0.24, h: 0.52 } // 1:2.17, the ratio of .caret's 8px x 1.05em

const inRoundedRect = (x, y, r) => {
  const cx = Math.min(Math.max(x, r), 1 - r)
  const cy = Math.min(Math.max(y, r), 1 - r)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

const inCursor = (x, y) =>
  Math.abs(x - 0.5) <= CURSOR.w / 2 && Math.abs(y - 0.5) <= CURSOR.h / 2

/** 4x4 supersampling. Enough for two axis-aligned shapes and one arc. */
function render(size, { rounded }) {
  const px = Buffer.alloc(size * size * 4)
  const S = 4
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let tile = 0
      let cur = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (pxi + (sx + 0.5) / S) / size
          const y = (py + (sy + 0.5) / S) / size
          const inside = rounded ? inRoundedRect(x, y, RADIUS) : true
          if (!inside) continue
          tile++
          if (inCursor(x, y)) cur++
        }
      }
      const n = S * S
      const a = tile / n
      const c = tile === 0 ? 0 : cur / tile
      const o = (py * size + pxi) * 4
      for (let i = 0; i < 3; i++) px[o + i] = Math.round(GROUND[i] * (1 - c) + ACCENT[i] * c)
      px[o + 3] = Math.round(a * 255)
    }
  }
  return px
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** PNG-encoded ICO. Universally supported for a decade; a fifth the size of BMP. */
function ico(entries) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(entries.length, 4)
  let offset = 6 + entries.length * 16
  const dir = []
  for (const { size, data } of entries) {
    const e = Buffer.alloc(16)
    e[0] = size === 256 ? 0 : size
    e[1] = size === 256 ? 0 : size
    e.writeUInt16LE(1, 4) // colour planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    dir.push(e)
  }
  return Buffer.concat([head, ...dir, ...entries.map((e) => e.data)])
}

const icoSizes = [16, 32, 48].map((size) => ({
  size,
  data: png(size, render(size, { rounded: true })),
}))
writeFileSync('public/favicon.ico', ico(icoSizes))

/* iOS masks the corners itself and composites any alpha onto black, so the
   home-screen icon is a full-bleed square. */
writeFileSync('public/apple-touch-icon.png', png(180, render(180, { rounded: false })))

console.log('favicon.ico      ', icoSizes.reduce((n, e) => n + e.data.length, 0) + 6 + icoSizes.length * 16, 'bytes (16, 32, 48)')
console.log('apple-touch-icon ', png(180, render(180, { rounded: false })).length, 'bytes (180)')
