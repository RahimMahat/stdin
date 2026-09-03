import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

/**
 * The content layer is the schema layer. If a project has no throughput number
 * or a role has no start date, the build fails here rather than shipping a
 * page that quietly says nothing. That strictness is the point: this is a data
 * engineer's site, and unvalidated content would undercut the whole argument.
 */

const STALE_AFTER_DAYS = 90

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'slug must be kebab-case'),
    summary: z.string().max(160, 'summary is a one-liner; keep it under 160 chars'),
    // Ordering in `ls projects/` — lowest first.
    order: z.number().int(),
    started: z.coerce.date(),
    stack: z.array(z.string()).min(1),
    // The numbers that make the DAG honest in phase 3. Required on purpose.
    throughput: z.string(),
    latency: z.string(),
    // "What broke" and "what I changed" are separate fields so they cannot be
    // collapsed into a single sanitised paragraph.
    broke: z.string(),
    fixed: z.string(),
    // The one deliberate failure. Exactly one project may set this.
    failed: z.boolean().default(false),
    repo: z.string().url().optional(),
  }),
})

const roles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/roles' }),
  schema: z.object({
    org: z.string(),
    title: z.string(),
    start: z.coerce.date(),
    end: z.coerce.date().nullable().default(null), // null === current
    location: z.string(),
    // One line, commit-message voice. Enforced short.
    message: z.string().max(72, 'commit subjects wrap at 72 chars — so does this'),
  }),
})

const now = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/now' }),
  schema: z.object({
    updated: z.coerce.date().refine(
      (d) => (Date.now() - d.getTime()) / 86_400_000 < STALE_AFTER_DAYS,
      `now/ is older than ${STALE_AFTER_DAYS} days. Update it or delete it — a stale "now" is worse than no "now".`,
    ),
    building: z.array(z.string()).min(1),
    reading: z.array(z.string()),
    learning: z.array(z.string()),
  }),
})

export const collections = { projects, roles, now }
