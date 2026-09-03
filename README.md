# stdin

A personal site you query instead of browse. Concept and stack decision:
<https://claude.ai/code/artifact/73ca0da6-be8f-4f24-b6f7-233b3d5fa112>
Original brief: `personal_website_design.pdf`.

**Phase 1 is built**, with real content in. Content, the output AST, and the
build-time renderer.
Every command is already a real, indexable, JavaScript-free URL. The live
terminal is phase 2.

```bash
npm run dev            # localhost:4321
npm run build          # static build + internal link check
npm run check          # typecheck (astro check)
npm run check:content  # fails while TODO placeholders remain — run before deploying
npm test               # build, then drive the live shell in a real DOM
```

## The one idea

A command never returns HTML and never returns a string. It returns a typed
node list (`src/render/ast.ts`), and two renderers consume it:

| renderer | when | produces |
| --- | --- | --- |
| `src/render/static.ts` | build time | the HTML for `/whoami`, `/projects/<slug>`, … |
| `src/render/live.ts` | in the browser | the same nodes, streamed into the terminal |

That split is what buys SEO, no-JS support, shareable URLs and reduced-motion
support from a single content definition. **Nothing in `src/commands/` may touch
the DOM or import from `astro:content`** — commands run unchanged inside the
browser bundle, which is the only reason one definition can serve both.

Two consequences worth knowing before you edit either renderer:

- Markdown is resolved to HTML in `src/data/site.ts`, not in a renderer. The
  browser never ships a parser; `marked` stays out of the bundle, and `npm test`
  would notice if it crept back in.
- The renderers must emit the same element tree. `npm test` runs every command
  through both and diffs the result, so a change to one that is not mirrored in
  the other fails the suite rather than quietly desyncing typed output from
  navigated output.

## The shell

`src/terminal/` is progressive enhancement, top to bottom. The prompt ships
`hidden` and `disabled` and is revealed only once the module runs, so a visitor
without JavaScript is never shown an input that cannot accept anything. Command
chips are anchors to real pages; the shell intercepts them only while it is
alive.

| key | does |
| --- | --- |
| `tab` | complete — unique match, else the longest shared prefix |
| `↑` `↓` | walk history (kept in `sessionStorage`), or the completion list |
| `enter` | run, or accept the highlighted completion |
| `esc` | close the completion list |
| `ctrl+c` | clear the input |
| `ctrl+l` | clear the screen |

Completion is a combobox/listbox: `aria-expanded`, `aria-activedescendant`, and
`role="option"` are wired, and output lands in a `role="log"` with
`aria-live="polite"`. The matcher is forty lines in `commands/fuzzy.ts` rather
than a fuzzy-search dependency — there are around a dozen candidates, and uFuzzy
would have outweighed the rest of the bundle.

Tab completion and the unknown-command fallback read the same candidate list
from the same matcher, both in the command layer, so the prompt cannot offer
something the shell then refuses. Anything offered as a chip goes through
`runnable()`, which strips placeholder tokens — `theme [dark|light]` displays
well and errors when executed. `npm test` asserts that every chip the site can
produce actually runs without failing.

A command only changes the URL when a page actually renders it (`pageFor` in
`src/commands/index.ts`). Errors and unknown input leave the address bar alone,
because a URL that shows something other than what you saw is worse than no URL
change.

The payload (`/site.json`) is fetched on idle, or the moment someone focuses the
prompt — whichever is first. Readers who never type do not pay for it.

## The masthead

`/` is the only page that introduces rather than prints. A terminal never has to
explain itself to a stranger, so the metaphor supplies no hierarchy and it had
to be stated: the name is an `<h1>` in the serif at display size, and the six
commands are a grid of destinations rather than a run of inline chips (the
`grid` flag on the `cmds` node, honoured by both renderers).

Hovering the name runs `src/effects/matrix-name.ts` — a cmatrix scramble
localised to the characters under the pointer. Three things constrain it, and
each is load-bearing:

- The letter keeps its box and turns transparent; the glyph is painted over it
  by a pseudo-element. Swapping the character itself would reflow a proportional
  serif sixty times a second.
- The glyph set is latin, digits and symbols. Katakana is the obvious choice and
  wrong — neither Newsreader nor JetBrains Mono ships it, so it would render as
  tofu.
- The `<h1>` is split into per-character spans only on first hover, the
  fragments are `aria-hidden`, and the name moves to `aria-label`. Splitting a
  heading otherwise makes some screen readers spell it out.

It refuses entirely on `prefers-reduced-motion` and on any device without hover.

## The dotfiles

`ls -a` lists three entries that `ls` does not: `.bash_history`, `.env` and
`.plan`. `cat .plan` is the payoff — `.plan` being the file the finger daemon
served, and the one Carmack kept as a public dev log, so the name alone is the
handshake. `.env` refuses to be read.

Staying hidden is the feature, not the content, so the tests mostly assert
absence: no page renders them, no URL resolves to one (`pageFor` returns null
for any dotfile), `help` does not list them, and neither tab completion nor the
did-you-mean fallback will ever suggest one. One check walks every built HTML
file and fails if the string `.plan` appears in any of them — a crawler must not
be able to find what a reader had to earn.

They live in `src/data/hidden.ts`. Edit the voice there; it should read like
something written for one person rather than published.

## Adding things

- **A project** — drop a file in `src/content/projects/`. It appears in
  `ls projects/`, gets a page at `/projects/<slug>`, and joins `/resume`.
- **A section** — write a `Command` in `src/commands/`, add it to `base` in
  `src/commands/index.ts`. Routing, `help`, and phase-2 autocomplete all read
  from that one array.
- **A link between commands** — use a `cmd:` cell, never a hand-written `href`.
  `hrefFor()` owns command→URL resolution so a chip cannot point at a route that
  was never generated.

## Guards

These exist because the concept only works if it is actually true, and each of
these failure modes is invisible during normal development.

- **Schema** (`src/content.config.ts`) — a project without a `throughput` or a
  role without a `start` fails the build.
- **Staleness** — `now/` older than 90 days fails the build. A stale "now" is
  worse than no "now". Verified: it does fail.
- **One failure only** — more than one project with `failed: true` throws in
  `src/data/site.ts`. The honest-failure node stops working if it is a genre.
- **Links** (`scripts/check-links.mjs`) — runs on every build; every internal
  href must resolve to a generated file.
- **Placeholders** (`scripts/check-content.mjs`) — fails while any `TODO —`
  marker survives. Not wired into `build` on purpose, so local builds work
  before the copy is finished. Wire it into CI before the first deploy.
- **The shell** (`scripts/smoke.mjs`, via `npm test`) — bundles the terminal as
  the browser gets it, mounts it on a built page in jsdom, and drives it:
  keys, completion, history, theme, URLs, and renderer parity. `jsdom` is a
  devDependency; nothing it touches ships.

## Theme

Dark is the default — deliberately, not via `prefers-color-scheme`. Light is the
warm paper from the original brief, reached with `theme light` and persisted in
`localStorage` under `stdin.theme`. A blocking script in `src/layouts/Shell.astro`
applies the stored choice before first paint, so there is no flash.

Both palettes hold contrast above 4.5:1 against their own ground, which is why
the amber accent shifts so far between them. Every colour is a token in
`src/styles/theme.css`; nothing is defined only inside a media query.

To follow the OS preference instead, add a `@media (prefers-color-scheme: light)`
block guarded as `:root:not([data-theme="dark"])` alongside the existing
`[data-theme="light"]` rule.

## Status

| phase | state |
| --- | --- |
| 1 · content + AST + static renderer | built · content complete, no placeholders |
| 2 · the shell | built · 45 checks in `npm test` |
| 3 · `dag` | blocked on real dates and throughput numbers |
| 4 · polish, font subsetting, contact function | started · `ls -a` egg in |

Weights, gzipped: ~2.1 KB per page, 2.1 KB CSS, 7.7 KB for the shell, and
4.8 KB for `/site.json` — the last two only for visitors whose browsers run
JavaScript, and the payload only on idle. Phase 4 replaces the Google Fonts link
with subset, self-hosted woff2.

## What is missing

Nothing is marked `TODO —` any more; `npm run check:content` passes. Content is
sourced from `profile.yml` and `rahim_mahat_cloud_data_engineer.pdf`, and every
number on the site is one of Rahim's own figures from that résumé — 50% lower
processing latency, 35% faster queries, 40% less manual effort, 30% lower
storage cost, 25% fewer failures. Prose is written around them; no figure was
invented.

Where the résumé gave no absolute volume, the `scale` row says what the system
spanned rather than quoting a count. If you know the real numbers — sources per
day, rows, TB scanned, environments under management — they belong there, and
they are stronger than what is there now.

**There is no "one that failed" page.** The file was deleted rather than filled:
it is the page an interviewer is most likely to ask you to walk through, and an
invented post-mortem is the one thing here that would be actively harmful. The
site builds fine with zero failed projects. To add the real one, drop a file in
`src/content/projects/` with `failed: true` — `ls` and `/resume` pick it up
automatically, and the one-failure-only guard keeps it singular.

Two things to check before deploying: the résumé is dated Feb 2025 and lists the
Infocepts senior role as current, so `roles/01-current.md` assumes that still
holds; and project `started` dates sit inside the right role tenure but are
estimates.
