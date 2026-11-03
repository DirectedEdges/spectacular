# Site Architecture

Docs site for Spectacular — Astro 4 + Starlight, published at
spectacular.systems, dev server at **localhost:4323**. Everything user-facing
about how Spectacular is
*intended* to work is documented here; the source remains authoritative for
what the code *does*. Hand-authored except two generated areas (§ Generated
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
| `src/content/docs/cli/commands/` | One page per CLI command, named for the command as `packages/cli/src/commands/` now is — so a page, its command and its source file share a name. Two exceptions worth knowing: the page is kebab-case where a command is camelCase (`apply-custom-tokens` ↔ `applyCustomTokens`), and `analyze` has a command file but no page |
| `src/content/docs/schema/` | Type pages + deep `styles/`/`typography/`/`effects/` property trees, plus cross-cutting pages that explain the contract rather than one node of it (`platform-neutrality`) |
| `src/content/docs/code/` | One page per emitted artifact (`contract`, `scaffold`, `styles`, `stories`, `cssvars`) — what `specs react` / `specs webcomponents` write, linked from both command pages |
| `src/content/docs/settings/` | One page per config key |
| `src/content/docs/versioning/` | Spec workspace versioning: overview + concept pages; command reference stays in `cli/commands/version.md`. These pages sit as a subgroup under Commands in the sidebar, not as a top-level section |
| `src/content/docs/roles/` | One page per role concept, plus `inventory` and `precedence`; a concept family shares one page (`textbox`, `status`) and the inventory links every member to it |
| `src/components/Figure.astro` | The in-content authoring component (`src, alt, caption?, maxWidth?`) |
| `src/custom.css` | The only stylesheet — Starlight overrides |
| `scripts/build-adrs.mjs` | ADR → docs page generator |
| `scripts/build-releases.mjs` | CHANGELOGs → `overview/releases.mdx` |
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
  text, wipes and rebuilds `docs/adr/`.
- `scripts/build-releases.mjs`: merges `packages/schema/CHANGELOG.md` +
  `packages/cli/CHANGELOG.md` into the tabbed releases page.

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
