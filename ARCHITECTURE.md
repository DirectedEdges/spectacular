# Repository Architecture

The home of the Specs model: the schema package (types + JSON Schema — the
contract every other repo consumes), the CLI that operates on it, the ADRs
that govern its evolution, and the docs site that publishes it. Operating
rules live in `CLAUDE.md`; this file is the structural map, weighted toward
`packages/schema`. The CLI has its own map at `packages/cli/ARCHITECTURE.md`;
the site at `site/ARCHITECTURE.md`.

## Repo map

| Node | Role |
|---|---|
| `packages/schema/` | `@directededges/specs-schema` — the contract (detail below) |
| `packages/cli/` | `@directededges/specs-cli` — see its own ARCHITECTURE.md |
| `adr/` | Numbered decision records + `INDEX.md`; the only front door for schema changes |
| `rfc/` | Broader-than-ADR proposals |
| `site/` | Astro docs site, port 4323 — own package, **not** a workspace member |
| `scripts/validate-schema.sh` | JSON-parse gate over `schema/*.schema.json` (metaschema pass only if `check-jsonschema` is installed — full validation is optional in practice) |
| `vitest.config.ts` | Single root config for all package tests — run from repo root |

## Schema package invariants (Constitution digest)

`packages/schema/CONSTITUTION.md` is authoritative; the load-bearing rules:

1. **Types ↔ schema parity is non-negotiable** — `types/` and `schema/`
   describe the same structure at all times; drift is a bug. No automated
   parity test exists: enforcement is review + `/specs.consistency-check`.
2. **No logic.** Type declarations and static JSON only. The sole runtime
   exports are `DEFAULT_CONVENTIONS`, `DEFAULT_SETTINGS`, `DEFAULT_PIPELINE`;
   adding a fourth requires constitutional amendment.
3. **`types/index.ts` is the entire public API.** Removing or renaming an
   exported type *or field* is breaking. Naming: code platforms outrank Figma;
   no downstream package's internals may drive an ADR decision.
4. Every change arrives via ADR → `/specs.adr.implement` → `/specs.adr.accept`
   (6-gate Constitution Check), with semver class and CHANGELOG entry.

Conceptual split (ADR-071): **Conventions** = facts about the Figma library (a
wrong value → *incorrect* output) · **Settings** = choices about output shape
(a different value → *different* output) · **Pipeline** = declared work.
There is no `Config.ts` anymore — older links to "Config" mean these three.

## Key nodes — schema

| Node | Role |
|---|---|
| `packages/schema/types/index.ts` | Barrel; the public API surface |
| `packages/schema/types/Component.ts` | Top-level spec shape |
| `packages/schema/types/ComponentConcernDocument.ts` | The three per-concern documents a component `splitConcerns` run writes (renamed from `ConcernDocument.ts`, ADR-110) |
| `packages/schema/types/CompositionConcernDocument.ts` | The three per-concern documents a composition `splitConcerns` run writes — its own exact shape, not a loosened form of the component one (ADR-109) |
| `packages/schema/types/Conventions.ts` | Largest type file; platform-keyed library facts + `DEFAULT_CONVENTIONS` |
| `packages/schema/types/Styles.ts` | Style values, token/prop/conditional binding, style enums |
| `packages/schema/types/Settings.ts` | Run choices + `DEFAULT_SETTINGS` |
| `packages/schema/types/Anatomy.ts` | Element tree; `role`/`action` concepts (open string sets, docs-governed) |
| `packages/schema/types/Props.ts` | `AnyProp` union |
| `packages/schema/schema/component.schema.json` | Primary JSON Schema — must mirror the `Component` tree |
| `packages/schema/schema/component-concern.schema.json` | The three component per-concern documents; references `component.schema.json` for shared definitions (renamed from `concern.schema.json`, ADR-110) |
| `packages/schema/schema/composition-concern.schema.json` | The three composition per-concern documents (ADR-109) |
| `packages/schema/schema/styles.schema.json` | Pairs with `types/Styles.ts` |
| `packages/schema/CONSTITUTION.md` | Governance: semver policy, 6-gate check |
| `packages/schema/CHANGELOG.md` | Mandatory per publish; bullets cite ADRs |
| `packages/schema/tests/` | Type-level `*.test-d.ts` files + runtime tests |

Enums have no separate file: closed sets are string-literal unions inside the
owning type file, mirrored as `enum` arrays in the matching `*.schema.json`.
Structural closed enums are named union types — `Style` is only for values
that can be token-bound, prop-bound, or conditional. SCREAMING_CASE for style
enum values except external standards (DTCG, CSS Color 4).

## The sync set

One schema change fans out across five surfaces, all manually synchronized —
the reason `/specs.consistency-check` exists:

- `types/*.ts` ↔ `schema/*.schema.json`
- `tests/*.test-d.ts`
- `CHANGELOG.md`
- `adr/NNN-*.md` + `adr/INDEX.md`
- `site/src/content/docs/schema/**` (hand-written, `.md`/`.mdx`, including
  `schema/documents/`; `docs/adr/` mirrors automatically at site build)

### The stylesheet sync set

A second, smaller one, and the reason it is written down: it has no ADR to
anchor it. A refactor that changes what the CSS transformer emits is not a
schema change, so nothing above fires — which is how the published style mapping
came to describe a gradient-stroke mechanism, a `FILL` translation and a
`text-align` vocabulary the transformer had all stopped using (specs#691).

- `packages/cli/src/transforms/css/**` — a module's emitted declarations
- `site/src/content/docs/code/style-mapping.md` — the appendix section that
  **names that module**, which is what makes the pair checkable
- `site/src/content/docs/code/styles.mdx` — the *Mapping Specs to CSS* table,
  when a style key is added or removed

Changing a module's output without the appendix is drift. The appendix names its
owning module in every section, so the changed file identifies the section to
re-verify.

## Consumers

`specs-schema → specs-from-figma (engine) → specs-cli / specs-plugin-2`, with
the emitter packages (`react-from-specs`, `webcomponents-from-specs`,
`figma-from-specs`) consuming the schema alongside the engine. Local dev
resolves through workspace/sibling symlinks; the `set-references-*` skills
swap `file:` ↔ versioned refs around releases, so mixed reference styles in
package.json files usually mean mid-release-cycle, not breakage.

## What the tooling may delete

The spec tree and the platform trees are not alike, and commands treat them
differently on purpose.

`specs/` is the **authored hub**, and it names what each folder holds:
`components/<key>/`, `compositions/<key>/`, and `analysis/` for analyzer reports
(ADR-096). A component and a composition may share a name. No command removes
anything from it. A folder
can be absent from a run for reasons the run cannot distinguish — a component
deselected in the manifest on purpose, or specs generated into the directory from
another source — so `generate` overwrites what it produces, reports folders it
found but did not write, and stops there (specs#595).

`react/src`, `webcomponents/src` and the other platform trees are **derived**.
Their files carry "Generated. Do not edit" headers, and a full emit removes
emitted component directories that have no corresponding spec folder. Keyed on
the spec tree rather than on the manifest, which is what makes it safe: a
deselected component keeps its spec folder and therefore its emitted output, and
a tree holding components from several sources orphans none of them, because emit
reads the whole spec tree. Directories only disappear when their spec genuinely
no longer exists — a rename or a removal — which is what keeps Storybook from
carrying components whose imports no longer resolve (specs#614).

Pruning is per **kind** and only over kinds the run emitted (ADR-096). A full emit
prunes `<tree>/src/components/` against the components it read and
`<tree>/src/compositions/` against the compositions, never one against the other —
and never a kind it skipped. A free-tier run skips compositions, so it leaves that
directory alone rather than deleting output a Pro run wrote and calling it orphaned;
the same reasoning already covered `--components` and license-aborted runs.

The rule, if the two ever seem to disagree: derived output tracks the hub; the hub
tracks nothing and is never deleted from.

## Verification

- `npm test` from repo root (root `vitest.config.ts` — package-local runs
  don't work).
- `bash scripts/validate-schema.sh` for the JSON Schemas.
- `/specs.consistency-check` before merging schema-touching branches.

## Known drift (as of 2026-09-05)

- `root.schema.json` / `components.schema.json` carry a non-standard
  `"version": "0.12.0"` while the package is at 0.31.0 — unmaintained key.
- Constitution cites `reference/styles.yaml`, which doesn't exist; says "no
  test framework required" (tests exist); consumer list omits the newer
  packages.
- No CI runs tests or schema validation (workflows: auto-label, deploy-docs,
  release-cli only). Schema release is manual by design.
- `tests/tmp/` at repo root holds committed CLI test scratch dirs.
- `styles.schema.json` has no `exports` subpath (reachable only via `$ref`).
