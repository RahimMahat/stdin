# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`stdin` is a personal site you query instead of browse. Every command is both a
real URL and something you can type at a live prompt, and the two must produce
identical output. Astro 5, static output, no UI framework, no runtime dependencies.

## Branch workflow

**Never commit to `main`.** Every change — feature, bug, hotfix, copy tweak —
gets its own branch, is tested from that branch, and reaches `main` only through
a pull request.

```bash
git checkout -b fix/404-page      # prefix matches the commit type: feat|fix|docs|build|chore
# ... work, commit ...
git push -u origin fix/404-page
```

Then open the PR at:
`https://github.com/RahimMahat/stdin/compare/main...<branch>?expand=1`
(`gh` is not installed on this machine, so PRs are opened in the browser.)

Cloudflare Pages builds **every branch**, so pushing gives you a preview URL to
test before merging. Cloudflare replaces `/` with `-` in the alias, so
`fix/404-page` is served at `fix-404-page.rahim-stdin.pages.dev`. Merging the PR
to `main` triggers the production deploy.

`npm test` must pass before a PR is opened.

## Commands

```bash
npm run dev            # astro dev on :4321
npm test               # build + link check + 97 shell checks — the real gate
npm run build          # astro build + check-links
npm run check          # astro check (types)
npm run check:content  # fails on TODO markers; deliberately NOT part of build
npm run icons          # regenerate favicon.ico + apple-touch-icon.png
```

There is no single-test filter — `scripts/smoke.mjs` is one script that prints a
named line per check. To narrow it, run it directly after a build and grep:
`node scripts/smoke.mjs | grep -i canonical`.

Never edit `astro.config.mjs` while a dev server is running; Astro's config-change
restart half-completes and serves a 51-byte page until you restart it manually.

## The invariant

A command returns `Out[]` — an AST defined in `src/render/ast.ts`. It never
returns HTML and never touches the DOM. Two renderers consume that AST:

- `src/render/static.ts` — build time, producing `/whoami`, `/projects/<slug>`, …
- `src/render/live.ts` — in the browser, streamed into the terminal

The last check in `smoke.mjs` ("every command renders identically in both
renderers") is what holds this together. **If you add a node type to the AST,
both renderers must handle it** or that check fails.

Markdown is resolved to HTML in the content layer (`src/data/site.ts`) at build
time, never in the browser — that is why the live renderer ships no parser.

## Layout

| path | role |
|---|---|
| `src/commands/` | one file per command; `index.ts` holds the registry, parser, and routing |
| `src/render/` | the AST and its two renderers |
| `src/terminal/` | the live shell: input, completion, streaming, theme |
| `src/data/` | content assembly and typed site data |
| `src/content/` | markdown collections (projects, roles, now) |
| `src/pages/` | thin Astro wrappers; `[command].astro` generates one page per `page: true` command |
| `scripts/` | the build guards and the icon generator |

Adding a command means adding a file in `src/commands/` and registering it in
`index.ts`. Setting `page: true` gets it a static page for free.

## Routing and canonicals

`build.format: 'file'` writes `/help.html`, not `/help/index.html`, and
`trailingSlash: 'never'`. Two consequences worth remembering:

- `Astro.url.pathname` carries `.html` at build time. `Shell.astro` strips it
  when building the canonical, because the host 308-redirects `.html` to the
  bare path and a canonical naming a redirect is a canonical naming the wrong page.
- `pageFor()`/`hrefFor()` emit **root-absolute** paths (`/ls`, `/projects/x`).
  This is why GitHub Pages project hosting (served under `/<repo>/`) will not
  work without threading a base path through both.

`site` in `astro.config.mjs` is the single source of the canonical origin. It must
name a host that actually serves the site — a canonical pointing at a dead or
someone else's domain is worse than none. Changing hosts means updating `site`
plus the two jsdom URLs in `smoke.mjs`. The canonical guards read the origin
*from* the config, so they verify internal consistency, **not** that the host is
real; that check is manual.

## Guards

Correctness lives in build-time checks rather than in review. Currently 97, in
`scripts/smoke.mjs` (plus `check-links.mjs` and `check-content.mjs`):

- content schema and a 90-day staleness rule on `now`
- exactly one project may be marked `failed`
- no broken internal links across all routes
- no TODO markers in content
- canonicals: present, right origin, no `.html`, root is the bare origin
- the favicon set ships and every page references it
- the terminal driven in real jsdom, including the masthead effect
- renderer parity

**When you fix a bug that a test could have caught, add the test in the same
commit.** That is the established pattern here and the reason the suite is this
size.

## Content

`src/content/` and `src/data/` are the whole content layer. `profile.yml` and
`*.pdf` are **gitignored on purpose** — they carry a phone number, visa status,
and compensation targets, and this repo is public. Everything the site needs from
them already lives in tracked files. Do not `git add -f` them.

## Deployment

Cloudflare Pages, free tier, project `rahim-stdin` → `https://rahim-stdin.pages.dev`.
Build command `npm run check:content && npm run build`, output `dist`, Node pinned
by `.nvmrc`. Pushing to `main` deploys production; there is no GitHub Actions CI
and none is wanted — the guards run inside the Cloudflare build instead.

Verify a deploy by **content-type**, not status code: Pages returns `200` with an
HTML body for missing assets, so a status-only check reports success for files
that are not there.

## Conventions

Commit subjects are lowercase, imperative, and typed (`feat:`, `fix:`, `docs:`,
`build:`). Bodies explain *why*, and name the alternative that was rejected.

Comments explain decisions, not mechanics. The existing ones set the voice —
match their density rather than adding narration.

## Known defects

- No `404.astro`. Missing URLs return **`200`** with a bare Cloudflare page —
  a soft 404 that crawlers will index, and a dead end for anyone who mistypes.
- On `/`, the crumbs duplicate the command grid directly below them.
