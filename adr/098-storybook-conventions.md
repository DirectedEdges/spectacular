# ADR: Storybook Conventions — `config/conventions/storybook.yaml`

**Branch**: `098-storybook-conventions`
**Created**: 2026-10-02
**Status**: ACCEPTED
**Summary**: A `storybook` conventions member maps publish concerns to open feature settings, loaded from `conventions/storybook.yaml` beside `specs` and `figma.primitives`.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`specs storybook publish` generates every non-component page a workspace Storybook shows — foundations, analyses, versions, navigation (DirectedEdges/specs#642). Those pages carry presentation choices that are taste rather than data: how a variable hierarchy collapses into rows on the colour page, whether leaf values group, and more of the same as each concern's pages take shape. Today those choices have no configuration surface at all — the reference workspaces encode them as hand edits tracked in a `CUSTOMIZATIONS.md`, which is exactly the "edits a customer makes to scaffolded files and loses on the next run" failure #642 names.

The configuration surfaces that exist are:

- `config/settings.yaml` → `Settings` — choices about **spec output shape** (`spec.details`, `spec.keys`, `spec.color`, …).
- `config/conventions/<platform>.yaml` → `Conventions` (ADR-078) — one file per platform, the basename being the id, composed by the loader into a single `Conventions` value. Two reserved basenames already share the directory without being platforms: `figma.primitives` (the promotion table, ADR-075) and `specs` (conventions about the spec itself, ADR-073 Decision 4).
- The workspace ADR *Scaffold as Shipped Software* (projects/030-storybook-init, ADR A) — governs what `specs storybook` writes and the overwrite rules, but deliberately left "those become settings with defaults" unresolved. This ADR is the configuration surface that decision lacked.

An interim `storybook.color.layout` key was briefly added to the `settings.yaml` reading code on `feat/storybook-init` without an ADR; this ADR replaces that surface, and the interim code is being reverted. The conventions directory is the legitimate home because conventions already carry per-platform presentation choices while settings carry spec-output choices.

One fact shapes everything below: storybook presentation conventions will be **very unstable early on**. Concerns are still gaining pages, pages are still deciding what they show, and the per-feature vocabulary will churn with them. A contract that freezes per-feature shapes now would need an ADR per page iteration.

---

## Decision Drivers

- **Additive only**: a new optional surface must not break any existing workspace or consumer (constitution III, VI gate 6).
- **Type ↔ schema parity**: whatever shape is fixed in `types/Conventions.ts` must be mirrored in `schema/conventions.schema.json` (constitution I).
- **No logic in the schema package**: the contract declares shape; validation behaviour belongs downstream (constitution II).
- **Never silent**: configuration the tool does not understand must be reported, never dropped, transformed, or default-substituted without a word. A silently ignored key is indistinguishable from a working one.
- **Instability tolerance**: per-feature vocabulary must be able to churn without a schema MAJOR or an ADR per page iteration.
- **One directory, one composition rule**: ADR-078 fixed `config/conventions/` as basename-keyed files composing into one `Conventions` value; a new surface should join that rule, not invent a second discovery path.

---

## Options Considered

### Decision 1 — Where the storybook presentation surface lives

#### Option A: `config/conventions/storybook.yaml` *(Selected)*

A reserved basename in `config/conventions/`, alongside `figma.primitives` and `specs`, composing into an optional `storybook` member of `Conventions`.

**Pros**:
- Conventions already carry per-platform presentation choices (`naming`, `glyphs`, `defaultFillWidth`); settings carry spec-output choices. Storybook page presentation is the former kind.
- The directory already has the precedent this needs: a reserved, non-platform basename whose body is its own contract (`specs.yaml`, ADR-073 Decision 4).
- One loader, one discovery rule, one resolved `Conventions` value — no second config path for downstream consumers to learn.
- Respects the ADR A boundary: that ADR governs what `specs storybook` *writes* (host config, generated trees, overrides); what a customer *declares* about presentation is workspace configuration, which lives in `config/`.

**Cons / Trade-offs**:
- `Conventions` was framed (ADR-071) as "facts about the libraries — a wrong value produces incorrect output", and a row-grouping choice is taste, not fact. The frame already stretched once: `specs.yaml` holds conventions about the spec itself, and `defaultFillWidth` is a presentation choice. This member stretches it the same direction.

#### Option B: keys under `storybook.*` in `config/settings.yaml` *(Rejected)*

What the interim code did.

**Rejected because**: `Settings` governs the shape of **spec output** — every key in it changes what a generated spec contains. Storybook page presentation changes no spec. Folding it in overloads the settings contract's meaning, and the settings file has no composition story for a surface expected to grow concern by concern.

#### Option C: a file owned by the `storybook/` tree itself (e.g. `storybook/config.yaml`) *(Rejected)*

**Rejected because**: the `storybook/` directory is governed by ADR A's overwrite rules — generated concern folders rewritten wholesale, an override tree the commands never write, host config written once by `init`. A config file there needs a fourth ownership class, and it puts declared workspace configuration outside `config/`, where no loader looks and no other declaration lives.

---

### Decision 2 — How strictly the shape is governed

#### Option A: file- and concern-level contract only, permissive inside each concern *(Selected)*

The contract fixes three things normatively:

- the file exists at `config/conventions/storybook.yaml` and is loaded with the other conventions files;
- its top level is concern keys matching the publish concerns, each containing per-feature settings (`<concern>: { <feature>: … }`);
- unknown concerns and unknown features are ignored **with a warning naming them** — never silently, and never silently transformed or default-substituted.

Inside each concern, the per-feature value shapes are deliberately **not** fixed by the schema contract. Validation of per-feature values is the concern implementation's job, under the same warn-never-silent rule.

**Pros**:
- Survives the instability: a page iteration adds or reshapes a feature without touching the schema package, so no MAJOR and no ADR per iteration.
- The warning rule is the compensating control for the permissiveness — a misspelled or outdated key is reported by name instead of silently doing nothing.
- Matches how the directory's other non-platform files already behave: malformed `specs.yaml` and `figma.primitives` members are dropped with a warning rather than failing the run.

**Cons / Trade-offs**:
- The schema cannot catch a mistyped *value* (a string where a boolean belongs); only the consuming implementation can, at run time.
- Feature vocabulary lives in the storybook documentation rather than in the type system until it stabilises.

#### Option B: fully typed per-feature schema now *(Rejected)*

Declare `color.rowGroup: string[]`, `color.groupLeaves: boolean`, and every subsequent feature as named, typed members.

**Rejected because**: it fixes vocabulary that is known to be unstable. Every page iteration would be a schema change, and a workspace on last week's CLI with this week's key gets a contract violation instead of a warning. When the vocabulary stabilises, tightening the schema is an additive refinement; loosening a frozen one is breaking.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conventions.ts` | Add `StorybookConventions` — concern-keyed map of feature-keyed values, both levels open | MINOR |
| `Conventions.ts` | Add optional `storybook?: StorybookConventions` to `Conventions` | MINOR |
| `Conventions.ts` | Add optional `storybook?: StorybookConventions` to `ResolvedConventions` | MINOR |

**Example — new shape** (`types/Conventions.ts`):

```yaml
# StorybookConventions: both levels are open string-keyed maps.
# Concern keys name publish concerns; feature values are validated
# by the concern implementation, not by this contract.
StorybookConventions:
  [concern: string]:
    [feature: string]: unknown
```

**Example — the authored file** (`config/conventions/storybook.yaml`, first concrete contents):

```yaml
color:
  rowGroup: []        # names of variable hierarchy levels to collapse into one row
  groupLeaves: false  # group all the leaves
```

The `color` features above are the surface's first contents, documented here as illustration. They are **not** normatively fixed by this ADR — per Decision 2, feature shapes inside a concern belong to the concern implementation.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `conventions.schema.json` | Add `StorybookConventions` definition — object of objects, `additionalProperties` open at both levels | MINOR |
| `conventions.schema.json` | Add optional `storybook` property to the `Conventions` definition referencing it | MINOR |

**Example — new definition** (`schema/conventions.schema.json`):

```yaml
StorybookConventions:
  type: object
  additionalProperties:        # concern-keyed
    type: object
    additionalProperties: true # feature-keyed; values deliberately unconstrained
```

### Notes

- `storybook` becomes the third reserved basename in `config/conventions/` (after `figma.primitives` and `specs`). It is not a platform; no platform may take the id.
- The never-silent rule is part of this decision's contract: a consumer reading `storybook.yaml` ignores an unknown concern or feature **only** with a warning that names it. Silent dropping, silent transformation, and silent default-substitution are all defects against this ADR.
- `DEFAULT_CONVENTIONS` is unchanged: absence of `storybook` means no storybook conventions are declared, and no default can supply a declaration.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `StorybookConventions` in `types/Conventions.ts` ↔ `StorybookConventions` definition in `schema/conventions.schema.json`; `Conventions.storybook` and `ResolvedConventions.storybook` ↔ the optional `storybook` property on the schema's `Conventions` definition. The openness is symmetric too — index signatures in the type, open `additionalProperties` in the schema.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Loads `config/conventions/storybook.yaml` with the other conventions files; `specs storybook publish` concerns read their blocks | Load the file; warn by name on unknown concerns/features; concern implementations validate their own feature values under the same warn-never-silent rule |
| `specs-from-figma` | None — `Conventions` gains an optional member it never reads | Recompile |
| `specs-plugin-2` | None — storybook publishing is a CLI surface | Recompile |

---

## Semver Decision

**Target version**: `0.35.0` — the `@directededges/specs-schema` version on the active `release/next` branch.

**Change class**: `MINOR` — a new exported type and new optional fields on existing types, with the symmetric schema addition. "MINOR for additive types or new optional fields" (constitution, Versioning); no existing field, type, or schema structure changes.

**Naming**: `storybook`, `rowGroup`, `groupLeaves` follow constitution VI rule 2 — no cross-platform consensus exists for storybook page presentation vocabulary, so the single consuming code surface's terms are used; no Figma vocabulary is involved.

---

## Consequences

- Storybook page presentation choices have a declared home: `config/conventions/storybook.yaml`, composed into `Conventions.storybook` — ending the era of hand edits tracked in a `CUSTOMIZATIONS.md` and the interim `settings.yaml` key, which is reverted.
- Concern implementations own their feature vocabulary and can iterate on it without schema releases; the schema package fixes only the file, the concern keying, and the openness.
- Misconfiguration is always visible: an unknown concern, unknown feature, or invalid feature value produces a warning naming it. Any consumer that drops one silently is in defect against this ADR.
- When the feature vocabulary stabilises, a future ADR may tighten `StorybookConventions` with named concern interfaces — an additive refinement, not a correction.
