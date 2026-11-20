# Site Architecture

Docs site for Spectacular — Astro 4 + Starlight, published at
spectacular.systems, dev server at **localhost:4323**. Everything user-facing
about how Spectacular is
*intended* to work is documented here; the source remains authoritative for
what the code *does*. Hand-authored except the generated areas (§ Generated
content).

## Invariants & gotchas

- **Never hand-edit `src/content/docs/adr/`** — generated from repo-root
  `adr/*.md` (ACCEPTED only) and gitignored. Edit the ADR, not the page.
- `overview/releases.mdx` is also generated (from the schema + cli CHANGELOGs)
  but is **not** gitignored — a committed copy drifts until the next build
  regenerates it.
- Generators run via `predev`/`prebuild`; a bare `astro dev` skips them.
- **A new page is orphaned until its `slug` is added to the `sidebar` array**
  in `astro.config.mjs`. (Exception: the ~61 deep pages under
  `schema/styles|typography|effects/` are deliberately sidebar-absent,
  reachable only through in-page links from `schema/styles.md`.)
- Pages importing images or components must be `.mdx`; assets import
  relatively from `src/assets/`.
- `pro/thankyou.mdx` is intentionally unlisted (post-purchase landing).
- **No `pro` or `experimental` badge goes on a `schema/` page**, in the sidebar
  or injected in-page. A badge there makes a claim about the *format*, which is
  open; what is licensed is what the tooling fills in. Tier information lives on
  `overview/licensing.md`, and badges belong on the command, settings, guide and
  plugin pages that describe tool behaviour.
- Fragile couplings to Starlight internals: the inline exclusive-accordion
  script in `astro.config.mjs` and the `!important` overrides in
  `src/custom.css` — both break candidates on a Starlight upgrade.
- CLI flag tables are maintained by hand against
  `packages/cli/src/commands/<command>.ts` — no generator links them, making
  them the most likely drift point on the site.

## Key nodes

| Node | Role |
|---|---|
| `astro.config.mjs` | Nav (`sidebar` array), port 4323, component overrides, `pro`/`experimental` badge constants, accordion script |
| `src/content/docs/` | All pages; directory = URL prefix; `index.md(x)` = section root |
| `src/content/docs/cli/commands/` | One page per CLI command, named for the command as `packages/cli/src/commands/` now is — so a page, its command and its source file share a name. The set is 1:1 in both directions; the one difference is spelling, where the page is kebab-case and the command is camelCase (`apply-custom-tokens` ↔ `applyCustomTokens`) |
| `src/content/docs/cli/skills/` | One page per skill `specs skills install` emits, named for the skill with its `specs-cli.` prefix dropped and dots kept (`states.setup` ↔ `states-setup.md`). Unlike commands the set is *not* 1:1 — a skill earns a page when it carries a judgment or a procedure worth reading; the roster of all of them is `cli/commands/skills.md` |
| `src/content/docs/schema/` | Type pages + deep `styles/`/`typography/`/`effects/` property trees, plus cross-cutting pages that explain the contract rather than one node of it (`platform-neutrality`) |
| `src/content/docs/code/` | One page per emitted artifact (`contract`, `scaffold`, `styles`, `stories`, `cssvars`) — what `specs react` / `specs webcomponents` write, linked from both command pages |
| `src/content/docs/settings/` | One page per config key |
| `src/content/docs/versioning/` | Spec workspace versioning: overview + concept pages; command reference stays in `cli/commands/version.md`. These pages sit as a subgroup under Commands in the sidebar, not as a top-level section |
| `src/content/docs/roles/` | One page per role concept, plus `inventory` and `precedence`; a concept family shares one page (`textbox`, `status`) and the inventory links every member to it |
| `src/components/Figure.astro` | The in-content authoring component (`src, alt, caption?, maxWidth?`) |
| `src/custom.css` | The only stylesheet — Starlight overrides |
| `scripts/build-*.mjs` | One generator per generated tree — see § Generated content |
| `scripts/lib/` | Shared mechanism: paths, naming, schema reading, YAML, markdown, the ADR index, bindings, emission, and the style containment tree |
| `scripts/content/` | Every sentence a generator emits, one module per generator plus `common.mjs` |
| `scripts/pages/` | A page's section order and its sections, where a generator has earned its own module |
| `scripts/verify-content.sh` | `npm run verify:content` — proves a generator change left output unchanged |
| `src/assets/plugin/` | Plugin screenshots; `src/assets/demoCarousel/` for the home page |

## Authoring conventions

- Frontmatter: `title` (double-quoted) + `description`, nothing else. H1 comes
  from `title`; body opens with unheaded prose, then `##` sections.
- Page templates in the wild — follow the section's existing shape:
  - **Settings**: intro → `## Default` → `## Values` (table) → `## Path`
    (`spec.x` in `config/settings.yaml`) → `### Example` (yaml) → `## See Also`
  - **Schema**: prose → `ts` type block → `##` per type → property table
    (`Property | Type | Required | Description`)
  - **CLI command**: intro → `bash` usage block → flag table with in-page
    anchors → `##` per mode; terminal output in bare fences
  - **Skill**: intro → where `specs skills install` writes it → `## Prerequisites`
    → `## Outline` (short bullets, one per step) → `## Related`. Kept small —
    procedure belongs in a guide, and a judgment the skill makes gets a
    `## Rationale` section rather than a longer outline
- Code fences: `yaml` and `bash` dominate; use `ts` (not `typescript`);
  `tsx`/`css` appear in transform docs.
- Cross-links are root-relative with trailing slash: `[scan](/cli/commands/scan/)`.
  Plugin pages end with `## Related Settings`; settings pages with `## See Also`.
- Admonitions are sparse (15 site-wide) — use rarely.
- MDX only when a page needs images or Starlight components; `Figure` is the
  standard image wrapper.

## Generated content

- `scripts/build-adrs.mjs`: reads repo-root `adr/*.md`, publishes ACCEPTED
  ADRs only, rewrites titles, downgrades links to unpublished ADRs to plain
  text, and writes `docs/adr/` in place.
- `scripts/build-releases.mjs`: merges `packages/schema/CHANGELOG.md` +
  `packages/cli/CHANGELOG.md` into the tabbed releases page.
- `scripts/build-mappings.mjs`: renders `schema/mappings/` (per-platform
  binding pages + cluster pages) from `packages/schema/mappings/bindings/`,
  with completeness enforced over both the style keys and the prop kinds.
- `scripts/build-style-pages.mjs`: the `schema/styles/` tree from
  `styles.schema.json`, the binding data, and `_style-page-content.json`.
- `scripts/build-prop-pages.mjs`: the `schema/props/` tree (kind, member and
  extensions pages) from `component.schema.json`, the binding data, and
  `_prop-page-content.json`. `schema/props.md` stays the hand-written hub.
- `scripts/build-anatomy-pages.mjs`: the `schema/anatomy/` tree, one page per
  `ElementType`, from `component.schema.json`, the binding data, and
  `_anatomy-page-content.json`.
- `scripts/build-specification.mjs`: wraps `packages/schema/SPECIFICATION.md`
  as `schema/specification.md`.

All seven run via `predev`/`prebuild`, sequentially, from `build:content` in
`package.json`; `npm run dev` additionally watches `packages/schema/schema/`,
`packages/schema/mappings/` and `adr/`, rerunning the generators a change in
each invalidates. The generated trees (`docs/adr/`, `schema/mappings/`,
`schema/styles/`, `schema/props/`, `schema/anatomy/`,
`schema/specification.md`, `overview/releases.mdx`) are gitignored.

No generator reads another's output, so the chain's order is a convenience
rather than a constraint. `build-mappings.mjs` used to consult the emitted
`schema/styles/` tree to decide which style keys it could link, which made
every such link depend on build order and dropped all of them on a clean clone.

### Where a line of code goes

Three layers, and three questions in order:

1. **Is it a sentence a reader reads, or a fragment of one?** It goes in
   `scripts/content/` — one module per generator, plus `common.mjs` for strings
   that are byte-identical across generators. Field labels and connectives
   count, not only whole sentences. **Build scripts carry no content.**
   Narrative that no schema member states lives further upstream still, in
   `packages/schema/mappings/_*-page-content.json`.
2. **Would a second generator need it, and does it know nothing about any one
   subject?** It goes in `scripts/lib/` — `paths`, `naming`, `schema`, `yaml`,
   `markdown`, `adr`, `bindings`, `emit`, and `style-tree` for the style
   containment traversal.
3. **Otherwise it is this generator's own structure** — it stays in the
   generator, or in `scripts/pages/` once that generator has earned a module
   there. `pages/style-page.mjs` owns the style page's section order;
   `pages/style-sections/` holds the sections themselves.

The dependency runs one way: `build-*` → `lib`, `content`, `pages`; `pages` →
`lib`, `content`; `lib` → nothing in `scripts/`; `content` → nothing at all.
`content` importing `node:fs` or `node:path` is the error that turns a prose
module into a build script, and `grep -l "node:path\|node:fs" scripts/content/`
returning nothing is the check.

### Emission

Every generator writes through `lib/emit.mjs`. A page is written only when its
bytes differ, so an unchanged page keeps its mtime; a stale page is removed by
the sweep at `commit()`, along with any directory that leaves empty. Nothing is
deleted before `commit()`, which a generator that failed its own checks does not
call.

This is not a style preference. Removing a whole output tree and writing it back
is correct output that a running `astro dev` does not survive — it serves 500s
for pages that are present and valid on disk — and that is why `adr/` could not
be watched until its generator stopped doing it.

### Verifying a change to a generator

`npm run verify:content` builds a baseline from a throwaway worktree, builds the
working tree twice, and diffs all seven artifacts. The second build is the one
that matters most: `writeIfChanged` plus the sweeps mean a second run can differ
from the first, and that is how a sweep bug surfaces. The generated trees are
gitignored, so this snapshot is the only proof that a refactor changed nothing.

## Verification

Dev server at localhost:4323 (`npm run dev` from `site/` — `predev` runs both
generators). Check the affected pages render and the sidebar entry appears.

## Known drift (as of 2026-09-05)

- `settings/promote-primitives.md` orphaned — likely superseded by
  `collapse-primitive-wrapper`; `schema/color-object.md` orphaned, possibly
  intentional deep reference.
- `@astrojs/sitemap` is a pinned dependency but not registered in
  `integrations[]` — dead config or a regression.
- `docs/plugin/` last touched 2026-07-13 — the section most behind the
  product.
- Asset layout not fully normalized (two loose `plugin-*.png` outside
  `assets/plugin/`).
