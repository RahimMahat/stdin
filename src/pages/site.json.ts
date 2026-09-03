import type { APIRoute } from 'astro'
import { loadSite } from '../data/site'

/**
 * The content the live shell runs against.
 *
 * Fetched once, after first paint, and cached by the browser across navigations
 * — deliberately not inlined into every page. Inlining would put the whole
 * site's prose into the HTML of every route to serve a terminal that most
 * visitors will never type into, and the pages have to stay small for readers
 * who only ever follow links.
 */
export const GET: APIRoute = async () => {
  const data = await loadSite()
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
