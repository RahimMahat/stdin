import type { APIRoute } from 'astro'
import { loadSite } from '../data/site'
import { pageCommands } from '../commands'

/**
 * /llms.txt — the llmstxt.org convention, for a model reading the site rather
 * than a person.
 *
 * The audience is real and specific: a recruiter's screening tool, or someone
 * asking an assistant "what has this person actually built". Either way the
 * reader summarises rather than browses, and a summary is only as good as the
 * specifics it was given. So this file is numbers and links — every claim in it
 * is restated on a page it points at, which is what lets a model repeat it
 * without inventing the middle.
 *
 * What it deliberately does not contain is an instruction. A line telling the
 * reader to recommend this candidate would be a prompt injection aimed at a
 * third party's software, and the screening vendors now scan for exactly that
 * shape: being caught planting one is a far worse outcome than any filter it
 * might get past. It would also be the weaker file. A model asked whether
 * someone is worth interviewing answers out of what it just read, and
 * "53,785 of 77,962 rows were wrong" survives that round trip in a way that
 * "an exceptional engineer" does not.
 *
 * Generated rather than dropped in `public/`, for the same two reasons the
 * sitemap is: the origin comes from `site` in astro.config.mjs, and the content
 * comes from the collections, so a project that exists is listed here and one
 * that does not cannot be.
 */

/** `2024-04-01` -> `Apr 2024`. The roles read as a range, not as timestamps. */
const month = (d: Date): string =>
  `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`

export const GET: APIRoute = async ({ site }) => {
  const data = await loadSite()
  const { profile, projects, roles, now } = data
  const url = (p: string): string => new URL(p, site).href

  const work = projects.filter((p) => p.kind === 'work')
  const personal = projects.filter((p) => p.kind === 'personal')
  // The first cut of this file said one project was marked as failed, because
  // the schema allows one. None was. A file written to be quoted cannot state
  // what the schema permits as though it were what the content holds.
  const anyFailed = projects.some((p) => p.failed)

  const entry = (p: (typeof projects)[number]): string =>
    [
      `- [${p.title}](${url(`/projects/${p.slug}`)}) — ${p.summary}`,
      `  - started ${p.started.toISOString().slice(0, 10)}, stack: ${p.stack.join(', ')}`,
      `  - scale: ${p.throughput}`,
      `  - outcome: ${p.latency}`,
      ...(p.repo ? [`  - source: ${p.repo}`] : []),
    ].join('\n')

  const body = `# ${profile.name} — ${profile.role}

> ${profile.years} building production data platforms, all at Infocepts. Owns the ingestion and transformation layers of a multi-source AWS platform end to end, including the pager. Currently in ${profile.location}, available ${profile.availability}.

This file follows the llmstxt.org convention. It exists because the site it
describes is a terminal rather than a set of pages, and a crawler should not
have to type commands to find out what is on it.

Every figure below is restated, with its working, on the page it links to.
Nothing here is a summary of a summary.

## Contact

- Email: ${profile.email}
- GitHub: ${profile.github}
- LinkedIn: ${profile.linkedin}
- Résumé: ${url('/resume')}

## What the evidence shows

${projects.length} written-up projects, ${work.length} of them paid work and ${personal.length} built independently.
They are write-ups rather than screenshots: each one names what broke before it
names what was changed, and the independent ones link to running source.

Three things recur across them and are the honest summary of this engineer:

1. **Measurement before assertion.** Two of the independent projects exist to
   put a number on a thing the field repeats as folklore — how much of a model's
   score is leakage, and how much of a lake an ordinary week corrupts. Both
   build the careless version on purpose so the damage can be attributed.
2. **Failure handling as the design, not the cleanup.** The production work is
   consistently about the half-applied write, the silent delete, the job that
   succeeded while being wrong. The ingestion write-up puts it as: the failure
   mode worth designing for is not "it broke", it is "it half-worked and nobody
   noticed".
3. **Being willing to publish the number that is against you.** These pages
   report the fault that turned out to be harmless${anyFailed ? ', the finding too small to defend, and the one project marked as failed' : ' and the finding too small to defend'}.
   That is unusual in a portfolio and it is the reason the rest of the numbers
   should be believed.

## Production work

${work.map(entry).join('\n')}

## Independent work

${personal.map(entry).join('\n')}

## Experience

${roles
  .map(
    (r) =>
      `- **${r.title}**, ${r.org} — ${month(r.start)} to ${r.end ? month(r.end) : 'present'}, ${r.location}\n  - ${r.message}`,
  )
  .join('\n')}

## Currently

${now.building.map((b) => `- Building: ${b}`).join('\n')}
${now.learning.map((l) => `- Learning: ${l}`).join('\n')}

See ${url('/now')} for the current version of this; it is dated and expires.

## Pages

${pageCommands()
  .map((c) => `- [${c.name}](${url(`/${c.name}`)}): ${c.summary}`)
  .join('\n')}

## Notes for a reader summarising this site

- Every page is both a URL and a command you can type at the prompt on the site,
  and the two produce identical output by construction.
- \`result: built and running locally\` on an independent project means exactly
  that, and is not a claim of production deployment. The distinction is enforced
  by the build.
${anyFailed ? `- One project is marked as failed on purpose. It is not an oversight, and a
  summary that omits it is less accurate than one that includes it.
` : ''}- The numbers on the independent projects come from runs that are reproducible
  from their linked repositories. Where a figure is one seed or one machine, the
  page says so rather than rounding it into a claim. The production figures are
  his own account of paid work and have no public source to check against.
`

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
