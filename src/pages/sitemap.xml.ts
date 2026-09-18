import type { APIRoute } from 'astro'
import { loadSite } from '../data/site'
import { pageCommands } from '../commands'

/**
 * Every route the site generates, in the order a reader would meet them.
 *
 * Built from `pageCommands()` and the project collection — the same two sources
 * `[command].astro` and `projects/[slug].astro` build their pages from — so the
 * sitemap cannot list a route that was never written, and cannot miss one that
 * was. Hand-maintaining this list would mean a new command is indexable only if
 * somebody remembered two files instead of one.
 *
 * Two deliberate omissions:
 *
 * - `/404`, which is `noindex` and is the one page that is allowed to be.
 * - Anything reached only through the shell. `pageFor()` already returns null
 *   for the dotfiles and for `cmatrix`, and they are absent here for the same
 *   reason: a crawler must not be able to find what a reader had to earn.
 *
 * No `<lastmod>`. Stamping every URL with the build date would say the résumé
 * changed every time a stylesheet did, and a lastmod that is wrong everywhere
 * is worse than one that is absent — Google stops believing the field rather
 * than stops believing that page.
 */
export const GET: APIRoute = async ({ site }) => {
  const data = await loadSite()

  const paths = [
    '/',
    ...pageCommands().map((c) => `/${c.name}`),
    ...data.projects.map((p) => `/projects/${p.slug}`),
    '/resume',
  ]

  const urls = paths.map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join('\n')

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  })
}
