/**
 * HTML escaping, in one place.
 *
 * Two renderers emit markup as strings — `static.ts` for pages and `dag.ts` for
 * the diagram both renderers share — and two copies of an escaping function is
 * one copy that eventually falls behind the other.
 */
export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
