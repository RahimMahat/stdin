import type { APIRoute } from 'astro'

/**
 * Served instead of the host's default.
 *
 * Cloudflare Pages answers /robots.txt for projects that do not ship one, and
 * what it serves is the content-signals preamble — a page of comments and not a
 * single directive. Nothing in it blocks a crawler, but nothing in it points at
 * a sitemap either, and for a site with no inbound links the sitemap line is
 * the whole of the discovery story.
 *
 * Generated rather than dropped in `public/` so the origin comes from
 * `site` in astro.config.mjs. A hard-coded host here would survive a domain
 * change and quietly advertise a sitemap that no longer exists.
 */
export const GET: APIRoute = ({ site }) => {
  const body = `User-agent: *
Allow: /

Sitemap: ${new URL('sitemap.xml', site)}
`

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
