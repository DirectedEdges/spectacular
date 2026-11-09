# ADR: Split the Spec Sidecar into `supplemental.yaml` for Builders and `guidelines.yaml` for Consumers

**Branch**: `118-supplemental-and-guidelines-sidecars`
**Created**: 2026-11-09
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none; promotes and splits the experimental CLI-defined `supplemental.schema.json`)*

---

## Context

A sidecar for "what a component needs beyond what the spec can carry" already ships, but not from this package. `packages/cli/src/validate/supplemental.schema.json` defines it, and its own description marks the contract EXPERIMENTAL and CLI-defined, "expected to move into `@directededges/specs-schema` once stable". Its validator (`packages/cli/src/validate/supplemental.ts`) does a shape check only; the comment at the top defers reference-level checks — that entries cite anatomy elements and props which exist in `api.yaml` — to "the validator's move to specs-schema-core". Issue #870 is that move.

Authoring rounds have now produced enough content to shape the contract rather than guess at it. Four of the five component folders in the component-marathon workspace carry a `supplemental.yaml`: `badge`, `button`, `icon`, `image`. Reading them against the shipped schema surfaces three problems.

**One file is serving two audiences.** The shipped schema's section vocabulary runs `anatomy`, `props`, `styles`, `slotComposition`, `events`, `accessibility`, `behavior`, `motion`, `layout`, `guidelines`. The first nine describe what a *builder* must implement by hand because no schema surface carries it — `button`'s press-scale transform, `image`'s IntersectionObserver, `icon`'s conditional `aria-hidden`. The tenth, `guidelines`, describes what a *consumer* arranging components must do — "never use a badge for a value that changes while on screen", "keep a badge label short enough to read at a glance". Those are different readers, different review cycles, and different delivery surfaces. In `badge`'s file the consumer half outnumbers the builder half seven entries to one.

**Two fields are not earning their place.** `schemaGap` is required on every entry, and on a builder entry it does real work — `button`'s motion entries name `styles.schema.json#/definitions/Styles` and state precisely which key is missing. On a consumer entry it has nothing to say: `badge` repeats a variation of "props carry no consumer-guidance surface" across seven of its eight guideline entries. `regenerationRisk` is a free-text field the schema describes as "the ledger of manual work that must be re-verified", and in practice it has absorbed a paragraph of prose per entry mixing three separate things — a risk grade, the mechanism's dependencies, and a re-check instruction. Several entries carry the value `"none"` or `"pending"`, which is a grade with no ledger behind it.

**The obligation level is trapped in prose.** Every consumer entry encodes its force in the opening words of a string: `must fill a badge's children slot`, `never use a badge for`, `should order a two-child fill glyph-first`. One `badge` entry carries `warn:` in the middle of its sentence. That is a field doing work inside free text, so nothing can sort by it, filter for it, or render it.

**A fifth authored file has already run ahead of the shape.** `specs/foundations/color.yaml` is authored, not generated — it carries `status: proposed`, an author, and a `sources:` list naming the generated reports it was synthesized from. It is the most developed guidance in the workspace, and it disagrees with the component sidecars on four points. It opens with a `meta` header (`concern`, `status`, `author`, `updated`, `sources`). It carries `useWhen` and `dontUseWhen` — token tables with a per-token `$description` saying what each token is for — which no component file has. Its `guidelines` entries key the obligation instead of naming it, and pair a prohibition with its remedy in one entry (`never:` alongside `must:`). And it uses five obligation words where the component files use three: `must`, `should`, `never`, `warn`, and `could`.

An external specification already covers most of this ground. The Design System Documentation Specification (DSDS) 0.23.1 at `designsystemdocspec.org/specification` models guidance as items with a `statement`, an RFC 2119 `level` of `must` / `should` / `should-not` / `must-not`, a `checkedBy` of `automated` / `assisted` / `manual`, and a `checks` pointer to the tests or lint rules that do the checking when `checkedBy` is `automated`. Its sections carry an audience `for` of `all` / `human` / `agent`. DSDS has no equivalent of `schemaGap` and no builder-versus-consumer audience axis, so the split itself is ours to define — but the entry shape for the consumer half is not, and divergence there buys nothing.

---

## Decision Drivers

- **One file, one audience.** A component builder and a component consumer read on different cycles for different reasons. A document serving both is reviewed by neither carefully.
- **Overlay-only discipline** (shipped schema's stated contract): a builder entry that cannot name the schema path failing it belongs in the spec, not the sidecar. Any shape that makes the gap optional loses the only pressure keeping the sidecar small.
- **Adopt before inventing, and declare every departure.** Where DSDS 0.23.1 already names a concept, use its field name and its value set, so a guidance document is a DSDS document rather than a translation of one. Where authored content needs something DSDS lacks, add it in the open with the entry that forced it — never by quietly redefining a DSDS field.
- **Minimal, stable, intentional public API** (Constitution III): the sidecar becomes part of `@directededges/specs-schema`'s surface. Fields that nothing reads and nobody maintains do not get promoted along with it.
- **Types and schema are the same contract** (Constitution I): every type added here has a JSON Schema counterpart, and the CLI stops carrying a private copy.
- **Naming — code platforms first** (Constitution VI): the platform and concern vocabularies are named for what code generators and documentation pipelines call things.
- **Mechanically verifiable** (Constitution IV): the enums close, so #870's reference checks can run against a known value set rather than free-form strings.
- **Evidence before generality.** The authored files are the fixture. A field with no authored instance behind it is deferred, not shipped.

---

## Options Considered

Twelve decisions are recorded below, each with its own alternatives. The Decision section that follows introduces nothing that is not chosen here.

### D1 — How many documents, and divided by what

#### Option A: Two documents, divided by audience *(Selected)*

`supplemental.yaml` carries what a builder must implement by hand. `guidelines.yaml` carries what a consumer must observe when using and arranging the component. The `guidelines` section key leaves `supplemental.yaml` entirely.

**Pros**:
- Each document has one reader, one review cycle, and one delivery surface.
- The two entry shapes can diverge where the audiences genuinely differ — `schemaGap` on one, `level` on the other — instead of a union shape where half the fields are dead on any given entry.
- `guidelines.yaml` becomes emittable as a DSDS guidelines section with no translation layer.

**Cons / Trade-offs**:
- Two shapes to document and two validators to maintain.
- An author must decide which file an entry belongs in, and some entries sit near the line — `badge`'s single `accessibility` entry is a builder requirement whose failure mode is a consumer mistake.

#### Option B: One document, with a per-entry audience field *(Rejected)*

Keep one `supplemental.yaml`; add DSDS's `for` to each entry, or a `builder` / `consumer` equivalent.

**Rejected because**: it keeps the fields united when the fields are what differ. A consumer entry needs `level` and has no `schemaGap`; a builder entry needs `schemaGap` and `platforms` and has no obligation level. A single shape must make all four optional, which abandons the overlay-only pressure that keeps the builder half honest.

#### Option C: Keep the shipped single document *(Rejected)*

Leave `guidelines` as a section key alongside the other nine.

**Rejected because**: the authored evidence shows the consumer half growing faster than the builder half and carrying a required field it cannot fill. The repetition in `badge` is the shape reporting its own mismatch.

---

### D2 — Where the concern is named

#### Option A: The document's top-level key *(Selected)*

`accessibility:`, `motion:`, and so on are the top-level map, each holding a list of entries.

**Pros**:
- Matches all four authored files and the shipped schema; no migration.
- Grouping is visible without reading entries, and a reviewer for one concern reads one block.

**Cons / Trade-offs**:
- An entry genuinely spanning two concerns is duplicated or forced into one. `button`'s reduced-motion entry is both `motion` and `accessibility`.
- There is no way to say "this applies to every concern", so the enum-absence convention used for `platform` has no analogue here.

#### Option B: A `componentConcern` field on each entry *(Rejected)*

One flat `entries:` list; absence of the field means the entry is general.

**Rejected because**: it rewrites all four authored files for a benefit only the rare cross-concern entry collects, and it loses the at-a-glance grouping that makes a long file reviewable.

#### Option C: A filename segment *(Rejected)*

`supplemental.motion.yaml`, `supplemental.accessibility.yaml`.

**Rejected because**: up to eleven files per component folder, and the general case has no filename.

---

### D3 — The `ComponentConcern` vocabulary

#### Option A: The shipped nine, plus `overrides` and `naming` *(Selected)*

`anatomy`, `props`, `styles`, `slotComposition`, `events`, `accessibility`, `behavior`, `motion`, `layout`, `overrides`, `naming`. Eleven values. `guidelines` is removed, having moved to its own document under D1.

**Pros**:
- Zero migration of the four authored files, which use `motion`, `slotComposition`, `accessibility`, `props`, `behavior`, and `guidelines` — all covered, with only `guidelines` relocating.
- `props` and `styles` match the spec's own concern filenames (`api.yaml` carries props, `styling.yaml` carries styles) and the existing `ComponentApiDocument` / `ComponentConcernDocument` type names, so one vocabulary spans spec and sidecar.
- `overrides` and `naming` are real gaps: nothing today carries "this element may be overridden by a caller" or "this is why the prop is called what it is".

**Cons / Trade-offs**:
- Rejects the plainer `configurations`, `styling`, and `slots` in favour of continuity with what already ships.
- `layout` and `motion` also appear in `FoundationConcern` (D10), so the two enums overlap by name while remaining distinct types.

#### Option B: `configurations` / `styling` / `slots` as renames *(Rejected)*

Adopt the plainer words and migrate.

**Rejected because**: it splits the vocabulary from the spec's own concern names, where `api.yaml` holds props and `styling.yaml` holds styles. Two words for one concern across spec and sidecar costs more than the readability gain.

#### Option C: The union of both lists *(Rejected)*

Thirteen or fourteen keys covering every candidate name.

**Rejected because**: two valid keys for one concern means authors guess, and the validator cannot tell a deliberate choice from a coin flip.

---

### D4 — How platform is expressed

#### Option A: An in-file field only *(Selected)*

One `supplemental.yaml` per component. Each entry names its platforms. Absence means the entry applies to every platform.

**Pros**:
- One file to read, one file to diff, one place an entry can hide.
- An intent shared across React and Web Components is stated once.

**Cons / Trade-offs**:
- A platform team cannot own a file; it owns a scattering of entries.

#### Option B: A filename segment *(Rejected)*

`supplemental.react.yaml` alongside a bare `supplemental.yaml` for cross-platform entries.

**Rejected because**: `button` and `icon` each state the same intent for both web platforms, which would duplicate the entry across two files and let the copies drift.

#### Option C: Both, filename as default *(Rejected)*

**Rejected because**: two ways to say one thing, plus a precedence rule to specify and validate.

---

### D5 — What `platforms` carries: scope only, or scope plus implementation path

#### Option A: A flat list of platforms *(Selected)*

`platforms: [react, webcomponents]`. Which platforms the entry applies to, and nothing else. Absence means every platform.

**Pros**:
- The field states one fact, and it is a fact about the spec: which platforms this requirement is scoped to. Where a particular implementation happens to put its file is a property of that implementation, not of the component's contract, and a schema that records it is recording something it cannot keep true.
- Validates against the `Platform` enum directly, so a typo fails. The shipped schema types the map's values as free-form strings, so a wrong path validates today.
- An entry that applies to iOS but is not yet implemented there can say so — it lists `ios` and no file exists yet. Under the map that case is indistinguishable from "does not apply to iOS".

**Cons / Trade-offs**:
- `icon` and `image` both state that the emitter redirects its stories to the authored `component.tsx` *because the entry names it*. That claim comes from the authored files' own prose and is unverified against emitter source. If it is real, the filename it reads has to come from somewhere else after this change — a naming convention the emitter applies, which is where a build-time fact belongs.
- A builder arriving at an entry no longer learns where it is implemented from the entry itself.

#### Option B: A map from platform to the authored file *(Rejected)*

`platforms: { react: component.tsx }`, as the shipped schema defines it.

**Rejected because**: it conflates two different kinds of fact in one field — the platform scope, which the spec owns, and an implementation path, which belongs to whatever tree holds the file. The schema cannot verify the path, cannot keep it current, and gains nothing by carrying it.

#### Option C: A flat list plus a separate `authoredIn` map *(Rejected)*

**Rejected because**: it keeps the implementation path in the schema under a second name, with nothing enforcing that the two fields agree.

---

### D6 — The `Platform` vocabulary and the `web` group

#### Option A: `web` is a group that expands, and may not overlap a leaf *(Selected)*

The enum is `react`, `webcomponents`, `web`, `ios`, `android`. `web` expands to `react` and `webcomponents` at read time. Naming `web` alongside either leaf in the same entry is a validation error. Absence of `platforms` means every platform.

**Pros**:
- "This is a web concern" gets a name, and the common two-platform case is one line instead of two.
- The overlap ban keeps expansion total — a reader never has to work out which of two mappings wins.

**Cons / Trade-offs**:
- The enum mixes levels: `react` and `webcomponents` are frameworks, `ios` and `android` are platforms, `web` is a group of frameworks. The unifying reading is that each value names an emission target, and iOS and Android have exactly one sanctioned target each — Swift with SwiftUI, and Kotlin with Jetpack Compose. `Platform`'s type documentation states that axis explicitly, so the next reader does not have to infer it.
- `Conventions.ts` documents its own platform-keyed map with the example keys `figma`, `react`, `swiftui`, so `swiftui` and `ios` name the same target in two places. This ADR leaves that alone: `Conventions.platforms` is an open map keyed by implementation id, where a framework name is the right granularity, and `Platform` is a closed enum of emission targets, where the platform is.

**Naming governance** (Constitution VI): rule 2 — no cross-platform consensus exists on whether to name the framework or the operating system, so a single platform's vocabulary is favoured. `react` and `webcomponents` are the names the two web emitters already carry in `react-from-specs` and `webcomponents-from-specs`. `ios` and `android` are the platform names the workspace's own platform-examples table uses, with the framework implied one-per-platform.

#### Option B: Leaves only, no group *(Rejected)*

**Rejected because**: the shared web case is the most common one in the authored files, and it loses its name.

#### Option C: A group that a leaf may narrow *(Rejected)*

**Rejected because**: a precedence rule and a second way to express one mapping, for a case no authored file presents.

---

### D7 — The `guidelines.yaml` entry shape

This decision is adopted from the Design System Documentation Specification (DSDS) 0.23.1, published at [designsystemdocspec.org/specification](https://designsystemdocspec.org/specification). The field names `statement`, `level`, `checkedBy`, and `checks`, the `must` / `should` / `should-not` / `must-not` value set, the `automated` / `assisted` / `manual` value set, and the rule that `checks` is required when `checkedBy` is `automated` are all DSDS's, not this ADR's. What is ours is the decision to adopt them rather than invent, the builder-versus-consumer split under D1 that DSDS does not model, and two declared additions named below.

#### Option A: DSDS field names, DSDS levels plus `may`, and an `instead` field *(Selected)*

`statement`, `level`, `checkedBy`, `checks` — DSDS names, used as DSDS defines them. `level` is one of `must`, `should`, `should-not`, `must-not`, `may`. An optional `instead` carries the corrective statement when the entry is a prohibition.

Two additions to DSDS, both deliberate:

- **`may`** is RFC 2119's fifth level and is not in DSDS 0.23.1's set. It is added because `foundations/color.yaml` already needs it: its `could` entry — that the three `*inverse` tokens are meant to travel together whenever a surface is dark enough to flip content — is a permission, and recording it as `should` would assert an obligation the system does not hold.
- **`instead`** pairs a prohibition with its remedy in one entry, which is how `color.yaml` already authors them. It exports as a DSDS namespaced extension.

**Pros**:
- A `guidelines.yaml` section is a DSDS guidelines section in field names and in four of five level values, so export is a pass-through for everything but two named extensions.
- RFC 2119 semantics are what the authored prose already reaches for in both the component files and `color.yaml`.
- `checkedBy` and `checks` give an obligation a verification story, which no field carries today.
- `instead` keeps one idea in one entry. A reader who hits the prohibition cannot miss the remedy, and the pair cannot drift apart or be half-deleted.

**Cons / Trade-offs**:
- `should-not` and `must-not` instead of the `never` the authored files use, so authoring is a small translation every time.
- `warn` has no level. `color.yaml` uses it as a key and one `badge` entry carries it mid-sentence; both become `should-not` with the hazard explained in the statement, which loses the distinction between "this is inadvisable" and "this will surprise you".
- Two extensions mean a DSDS consumer that ignores unknown fields silently drops every remedy. The prohibition survives the export; the fix does not.

#### Option B: DSDS four levels, verbatim, no additions *(Rejected)*

**Rejected because**: `color.yaml`'s `could` entry is a genuine permission, and the nearest DSDS level, `should`, states an obligation instead. Pure conformance here buys a cleaner export at the cost of saying something untrue in the source.

#### Option C: The authored five levels as keys, as `color.yaml` writes them *(Rejected)*

`must`, `should`, `never`, `warn`, `could`, each used as the entry's key.

**Rejected because**: it abandons D7's premise. Three of the five values have no DSDS equivalent, the level becomes a key rather than a value so nothing can filter on it without enumerating keys, and export needs a mapping table that will drift from the source it maps.

#### Option D: A local vocabulary with local field names *(Rejected)*

**Rejected because**: diverging wholesale from a published specification for no structural gain, and `never` versus `avoid` restates the `must-not` versus `should-not` distinction in words RFC 2119 already fixed.

---

### D8 — What replaces `regenerationRisk`

#### Option A: Drop it; adopt `checkedBy` and `checks` on both documents *(Selected)*

`regenerationRisk` is removed. `checkedBy` takes `automated`, `assisted`, or `manual`, and `checks` lists the tests or lint rules that do the checking, required when `checkedBy` is `automated`.

**Pros**:
- Replaces a free-text paragraph with a value a tool can act on, and uses DSDS's names for it.
- The field it replaces was carrying three things at once — a grade, a dependency list, and an instruction — and several entries filled it with `"none"` or `"pending"`, which is a grade and no ledger.

**Cons / Trade-offs**:
- `button`'s specific re-check instructions are genuinely useful and have nowhere to live. "Re-check the selector in `styles.css` after every re-emit" survives only as a `checks` pointer, losing the reason.
- Nothing now records that an overlay rides an emitted BEM class and goes silent if the class changes. That hazard is real and this ADR removes its home.

#### Option B: Drop it with no replacement *(Rejected)*

**Rejected because**: the verification question is legitimate even though the field answering it was poor, and DSDS already names the answer.

#### Option C: A narrow list of depended-on file paths *(Rejected)*

**Rejected because**: it keeps the mechanical half but invents a field DSDS has no equivalent for, and `checks` covers most of its value.

---

### D9 — `schemaGap`

#### Option A: An object, required on supplemental, absent from guidelines *(Selected)*

`schemaGap: { path, need }`. `path` admits a JSON Schema pointer and also any repo-relative target — `analysis/foundations.yaml` and a `conventions.specs.*` key are both already cited in the authored files. Required on every `supplemental.yaml` entry. Not a field on `guidelines.yaml` at all.

**Pros**:
- Splits the one string that currently carries both the location and the argument, so the location can be checked mechanically and the argument read by a human.
- Keeping it required preserves the overlay-only pressure: an entry that cannot name its gap belongs in the spec.
- Dropping it from guidelines removes the seven near-identical filler lines in `badge` and keeps that document DSDS-pure.

**Cons / Trade-offs**:
- Admitting any repo-relative target weakens the reference check #870 asks for: a JSON Schema pointer can be resolved and verified, `analysis/foundations.yaml` can only be checked for existence.
- With no `schemaGap` on guidelines, nothing stops a guideline that should have been a spec field. The overlay-only discipline now covers half the sidecar.
- Several authored entries open with `"none"` or `"none for the visual"`, which a required field cannot express. Those entries need rewriting or relocating.

#### Option B: JSON Schema pointers only *(Rejected)*

**Rejected because**: `image`'s "no duration or easing token exists" gap points at `analysis/foundations.yaml`, and `icon`'s points at a conventions key. Restricting the field forces those into a schema path that is not where the gap is.

#### Option C: Optional on guidelines, required on supplemental *(Rejected)*

Functionally close to the selection, differing only in whether the field exists on guidelines at all.

**Rejected because**: an optional field here cannot be validated either way, and its presence invites back the filler it is meant to remove. Absence is the stronger statement.

---

### D10 — Scope levels and the foundations path

#### Option A: Three scopes — component, catalogue, and foundation *(Selected)*

| Scope | Supplemental | Guidelines |
|---|---|---|
| One component | `components/<component>/supplemental.yaml` | `components/<component>/guidelines.yaml` |
| Every component | `components/supplemental.yaml` | `components/guidelines.yaml` |
| One foundation | `foundations/<foundationConcern>/supplemental.yaml` | `foundations/<foundationConcern>/guidelines.yaml` |

`FoundationConcern` is `color`, `typography`, `layout`, `space`, `shape`, `elevation`, `motion`, `brand`.

Scopes are additive, not overriding. A catalogue entry and a component entry both apply; neither replaces the other. Entries are statements about a subject, not values at a key, so there is nothing for a narrower scope to win.

**Pros**:
- A rule true of every component is stated once. `image`'s and `icon`'s `accessibilityLabel` accessibility entries are nearly identical and belong at the catalogue scope.
- Foundations have gaps too, and `button`'s "no duration or easing token exists" entry is a foundation-scope statement currently filed under a component.
- A foundation concern is a directory holding bare filenames, exactly as a component is. One rule reads across all three scopes: the subject is the directory, the document is `supplemental.yaml` or `guidelines.yaml`.
- Nothing generates into `foundations/`. The generated foundations report is `analysis/foundations.yaml`, written by the CLI's foundations analyzer; the existing `foundations/color.yaml` is authored, carrying `status: proposed` and a `sources:` list naming the generated reports it was synthesized from. So there is no generated file for an authored one to overwrite, and no disambiguating suffix is needed.

**Cons / Trade-offs**:
- The catalogue scope has no authored file behind it, so its shape is reasoned rather than observed — the thing this ADR otherwise avoids.
- The additive rule means two scopes can state the same subject at conflicting `level`s, and no validator can catch it. A catalogue `must` and a component `should-not` on one subject is an authoring error that ships.
- `foundations/color.yaml` moves to `foundations/color/guidelines.yaml` and its builder-facing content, if any, to the sibling `supplemental.yaml`. That is an authored-content migration, not a package change, but it is a real edit to a file someone wrote by hand.

#### Option B: Per-component only *(Rejected)*

**Rejected because**: duplication across component folders is already visible in the authored files, and a later ADR adding the catalogue scope would have to migrate those duplicates.

#### Option C: Component and catalogue, deferring foundations *(Rejected)*

**Rejected because**: the foundation scope has more authored evidence than the catalogue scope does. `foundations/color.yaml` exists and carries guidance, and `button`'s "no duration or easing token exists" entry is a foundation-scope gap currently filed under a component.

#### Option D: A `generated.yaml` beside `supplemental.yaml` in each concern directory *(Rejected)*

`foundations/<concern>/generated.yaml` for machine output, `supplemental.yaml` and `guidelines.yaml` for authored content, so the authored and generated halves are visibly separate and a regeneration cannot overwrite an authored file.

**Rejected because**: nothing generates into `foundations/`, so `generated.yaml` would be an empty slot reserving a problem that does not exist. The CLI's foundations analyzer writes `analysis/foundations.yaml`, and the whole `analysis/` directory is already the generated half of the workspace — a second generated location would split machine output across two trees. If a per-concern generated foundation document is ever wanted, `analysis/` is where it belongs.

---

### D11 — Selection guidance: `useWhen` and `dontUseWhen`

`foundations/color.yaml` carries two sections the component sidecars have no equivalent of. Each lists subjects with a per-subject `$description` saying what that subject is for, or why it is off-limits:

```yaml
useWhen:
  tokens:
    - { $token: "DE Color/Text/Primary", $description: "default body and label text on any light surface" }
dontUseWhen:
  tokens:
    - { $token: "DE Palette/*", $description: "a raw ramp step — styling from a ramp bypasses the layer that carries intent and theming" }
```

This is a different kind of statement from a rule. A rule says what an author must do; these say what each thing in a set is for. Thirty tokens as thirty `should` entries is unreadable, and the table is the most immediately useful content in the file.

#### Option A: First-class sections on `guidelines.yaml`, at every scope *(Selected)*

`useWhen` and `dontUseWhen` sit beside the concern keys on any `guidelines.yaml`. Each holds subject lists keyed by subject kind — `tokens` is the only kind the authored file uses; `props`, `variants`, and `slotFills` are the component-scope kinds.

**Pros**:
- Keeps the scannable table that makes `color.yaml` useful, instead of dissolving it into thirty entries.
- `badge`'s "choose colour for the status reported, not decoration — the options are the Alert families" is already selection guidance wearing a rule's clothes, so the component scope needs this too.
- Separating "what is this for" from "what must you do" means the rules section stays short enough to read in full.

**Cons / Trade-offs**:
- A third entry shape to specify and validate, and `$description` is a DSDS-less field on a DSDS-shaped document.
- The line between a `dontUseWhen` subject and a `must-not` rule is a judgment call. "Never style from a ramp step" appears in `color.yaml` both as a `dontUseWhen` token and as a paired `never`/`must` guideline, so the authored evidence already duplicates across the two.
- The component-scope subject kinds have no authored instance, so only `tokens` is drawn from evidence.

#### Option B: Foundations only *(Rejected)*

**Rejected because**: `badge` already carries a component-scope selection rule, and confining the sections to foundations forces it to stay a prose statement.

#### Option C: Convert each subject to an entry *(Rejected)*

**Rejected because**: it trades the one table a reader scans first for thirty rules nobody reads to the end of, and it asserts an obligation where the source only described a purpose.

---

### D12 — The `meta` header

#### Option A: Adopt it as authored *(Selected)*

Both documents open with `meta`: `concern`, `status`, `author`, `updated`, and `sources`.

**Pros**:
- `color.yaml` already has it, and `status: proposed` is load-bearing — it is how a ratifier knows the file is a proposal rather than settled guidance. Nothing else in the workspace distinguishes the two.
- `sources:` records which generated reports a document was synthesized from, which is what a reviewer needs to check the synthesis and what a regeneration needs to know has gone stale.
- Reverses this ADR's earlier position, which deferred metadata on the grounds that the shipped sidecar has none. That reasoning read the component files and not the foundation file.

**Cons / Trade-offs**:
- `author` and `updated` duplicate what git records, more reliably than a hand-edited field does. They will go stale and nothing will catch it.
- `concern` restates the directory name at the component and foundation scopes, where the path already says it.

#### Option B: `status` and `sources` only *(Rejected)*

Drop `author` and `updated` as git's job.

**Rejected because**: it diverges from the authored file to save two lines, and a document a human is expected to ratify is one where a visible author and date are read by people who are not going to run `git log`.

#### Option C: No `meta` block *(Rejected)*

**Rejected because**: `color.yaml` says `proposed`, so the review-status distinction is already in use. Removing the field does not remove the need.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Platform.ts` *(new)* | Add `Platform` — `'react' \| 'webcomponents' \| 'web' \| 'ios' \| 'android'` | MINOR |
| `Concerns.ts` *(new)* | Add `ComponentConcern` — the eleven values from D3; add `FoundationConcern` — the eight values from D10 | MINOR |
| `SidecarMeta.ts` *(new)* | Add `SidecarMeta` — `concern`, `status`, `author`, `updated`, `sources`; add `SidecarStatus` | MINOR |
| `SupplementalDocument.ts` *(new)* | Add `SupplementalDocument`, `SupplementalSection`, `SupplementalEntry`, `SchemaGap`, `CheckedBy` | MINOR |
| `GuidelinesDocument.ts` *(new)* | Add `GuidelinesDocument`, `GuidelinesSection`, `GuidelineEntry`, `ObligationLevel`, `SelectionGuidance`, `SelectionSubject` | MINOR |
| `index.ts` | Re-export every type above | MINOR |

**Example — new shape** (`types/SupplementalDocument.ts`):
```yaml
SupplementalDocument:
  meta?: SidecarMeta
  # One optional key per ComponentConcern, each a list of entries.
  # No concern key is required; an empty document is valid.
  "[concern: ComponentConcern]"?: SupplementalEntry[]

SidecarMeta:
  concern?: string                # restates the directory at the component and foundation scopes
  status?: SidecarStatus          # 'proposed' | 'ratified' | 'deprecated'
  author?: string
  updated?: string                # YYYY-MM-DD
  sources?: string[]              # the generated reports this was synthesized from

SupplementalEntry:
  intent: string                  # required — a testable statement, no rationale prose
  schemaGap: SchemaGap            # required — the overlay-only gate
  platforms?: Platform[]          # absent = applies to every platform
  checkedBy?: CheckedBy
  checks?: string[]               # required when checkedBy is 'automated'

SchemaGap:
  path: string                    # JSON Schema pointer, or any repo-relative target
  need: string                    # what that target cannot carry, and why

CheckedBy: 'automated' | 'assisted' | 'manual'
```

**Example — new shape** (`types/GuidelinesDocument.ts`):
```yaml
GuidelinesDocument:
  meta?: SidecarMeta
  useWhen?: SelectionGuidance     # what each subject in a set is for
  dontUseWhen?: SelectionGuidance # which subjects are off-limits, and why
  "[concern: ComponentConcern]"?: GuidelineEntry[]

GuidelineEntry:
  statement: string               # required — the rule, DSDS field name
  level: ObligationLevel          # required — RFC 2119 semantics
  instead?: string                # the remedy, when the entry is a prohibition
  checkedBy?: CheckedBy
  checks?: string[]               # required when checkedBy is 'automated'

# DSDS 0.23.1's four, plus RFC 2119's `may` — see D7 for why
ObligationLevel: 'must' | 'should' | 'should-not' | 'must-not' | 'may'

SelectionGuidance:
  tokens?: SelectionSubject[]
  props?: SelectionSubject[]
  variants?: SelectionSubject[]
  slotFills?: SelectionSubject[]

# `$token` for the tokens kind; `$name` for the others. Exactly one, never both.
SelectionSubject:
  $token?: string
  $name?: string
  $description: string            # required — what it is for, or why it is off-limits
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `supplemental.schema.json` *(new)* | The `SupplementalDocument` contract; `additionalProperties: false` closes the key set to `ComponentConcern` plus `meta` | MINOR |
| `guidelines.schema.json` *(new)* | The `GuidelinesDocument` contract; same closed concern set plus `meta`, `useWhen`, `dontUseWhen` | MINOR |
| `package.json` | Add `./schema/supplemental` and `./schema/guidelines` to the `exports` map | MINOR |

**Example — new shape** (`schema/supplemental.schema.json`):
```yaml
# The platform group ban from D6, and the checks requirement from D8
SupplementalEntry:
  required: [intent, schemaGap]
  additionalProperties: false
  properties:
    platforms:
      type: array
      minItems: 1
      uniqueItems: true
      items: { enum: [react, webcomponents, web, ios, android] }
      # `web` expands to both web leaves, so naming it beside either is contradictory
      not:
        allOf:
          - contains: { const: web }
          - contains: { enum: [react, webcomponents] }
  if:    { properties: { checkedBy: { const: automated } }, required: [checkedBy] }
  then:  { required: [checks] }
```

**Example — new shape** (`schema/guidelines.schema.json`):
```yaml
GuidelineEntry:
  required: [statement, level]
  additionalProperties: false
  properties:
    level: { enum: [must, should, should-not, must-not, may] }
    instead: { type: string, minLength: 1 }
  if:    { properties: { checkedBy: { const: automated } }, required: [checkedBy] }
  then:  { required: [checks] }

# Exactly one subject key, never both — `$token` for tokens, `$name` elsewhere
SelectionSubject:
  required: [$description]
  additionalProperties: false
  properties: { $token: {...}, $name: {...}, $description: { minLength: 1 } }
  oneOf:
    - required: [$token]
    - required: [$name]
```

### CLI changes (`packages/cli/`)

| File | Change |
|------|--------|
| `src/validate/supplemental.schema.json` | Deleted — superseded by the published schema |
| `src/validate/supplemental.ts` | Compile the published `supplemental.schema.json` and a new `guidelines.schema.json` instead of the local copy |
| `src/validate/run.ts` | Validate `guidelines.yaml` wherever it validates `supplemental.yaml`, at all three scopes from D10 |
| `src/validate/references.ts` | Resolve a `schemaGap.path` that is a JSON Schema pointer; check a `useWhen` / `dontUseWhen` `$token` against the library the way `$token` is already checked in specs |
| `src/skills/*.md` | Update the authoring skills that describe the sidecar's shape |

The reference-level checks issue #870 asks for land here, against the closed enums this ADR provides: an entry citing an anatomy element or prop must cite one that exists in the sibling `api.yaml`, and a `schemaGap.path` that is a JSON Schema pointer must resolve.

### Notes

**On the package #870 names.** The issue says the validator "lands in specs-schema-core". No such package exists — `spectacular/packages/` holds `schema` and `cli` only. This ADR reads that as the schema package's core contract and places the types and schema files in `packages/schema`, leaving the validator itself in the CLI, since Constitution II bars logic from the schema package.

**On what stays out of v1.** DSDS's section-level `for` audience of `all` / `human` / `agent` is not adopted as a field. The builder-versus-consumer split under D1 is the audience axis this schema needs, and `for: all` is what a DSDS export emits. An agent-only guideline is a real future case with no authored instance behind it. No `title` either — the three scope paths name their subject, and `meta.concern` restates it for a reader who has only the file.

**On the two DSDS divergences.** `may` on `ObligationLevel` and `instead` on `GuidelineEntry` are the only places this schema departs from DSDS 0.23.1, and both are recorded in D7 with the authored entry that forced them. A DSDS consumer that drops unknown fields keeps every prohibition and loses every remedy, which is the cost of `instead` and the reason it is worth naming rather than burying.

**On the authored files.** Five authored files need editing for this contract, all of them workspace content rather than package content, so none of it gates this ADR. The four `supplemental.yaml` files move their `guidelines` sections out, turn `schemaGap` strings into objects, drop `regenerationRisk`, drop the `platforms` map's file paths, and resolve the entries whose `schemaGap` reads `"none"` by moving them into the spec or justifying them. `foundations/color.yaml` moves to `foundations/color/guidelines.yaml` and converts its obligation keys to `level` values with `instead`.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes. The two document types have a schema file each; `Platform.ts`, `Concerns.ts`, and `SidecarMeta.ts` contribute types referenced by both schemas rather than standalone schema files.
- **Parity check**: `SupplementalDocument` ↔ `supplemental.schema.json` root. `GuidelinesDocument` ↔ `guidelines.schema.json` root. `ComponentConcern` ↔ the closed `properties` key set in both. `SidecarMeta` ↔ the `meta` definition in both. `Platform` ↔ the `platforms` array's `items.enum`. `ObligationLevel` ↔ `GuidelineEntry.level`'s `enum`. `CheckedBy` ↔ `checkedBy`'s `enum` in both. `SelectionGuidance` and `SelectionSubject` ↔ the `useWhen` / `dontUseWhen` definitions.
- **Asymmetries, all deliberate**: three constraints are expressible in JSON Schema and not in TypeScript — `checks` required when `checkedBy` is `automated`, the ban on `web` appearing beside a web leaf, and exactly one of `$token` or `$name` on a `SelectionSubject`. Each is documented on its type as a constraint the schema enforces, so a reader of the types learns the rule even though the compiler will not apply it.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Update usage | Deletes its private schema copy, imports the published pair, validates `guidelines.yaml` at three scopes, and gains #870's reference checks. The authoring skills' descriptions of the sidecar need rewriting. |
| `specs-from-figma` | None | Generate never writes either sidecar; both are authored. |
| `react-from-specs`, `webcomponents-from-specs` | Verify one claim, possibly add a convention | `platforms` no longer carries a file path (D5). If the story-redirect behavior the authored files describe is real and reads that path, the emitters need a naming convention to supply it instead — an authored `component.tsx` or `component.ts` beside the scaffold. That claim is unverified in this ADR and must be checked before implementation, because the answer decides whether a convention has to be written. |
| `figma-from-specs` | None | Neither sidecar renders to canvas. |
| Spec workspaces | Author migration | Four marathon `supplemental.yaml` files need the edits listed in Notes. `foundations/color.yaml` moves to `foundations/color/guidelines.yaml`, its five obligation keys become `level` values with `instead` on the paired entries, and its `could` entry becomes `may`. |

---

## Semver Decision

**Target version**: `0.40.0` — the version of the active release branch this ADR merges into.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: Constitution III's versioning rule gives `MINOR` for additive types and new optional fields. Every change to `@directededges/specs-schema` here is additive: four new type files, two new schema files, two new `exports` entries, and nothing removed or renamed in the published surface. The shape changes that *are* breaking — `regenerationRisk` removed, `schemaGap` becoming an object, `guidelines` leaving the document — break a contract this package never published. It lives in `packages/cli/src/validate/supplemental.schema.json`, self-declared EXPERIMENTAL, and the authored files depending on it are workspace content. The CLI's own version carries that break.

---

## Consequences

- A component's sidecar content divides by reader: builders read `supplemental.yaml`, consumers read `guidelines.yaml`, and neither wades through the other's entries.
- A `guidelines.yaml` is a DSDS 0.23.1 guidelines document in field names and in four of five level values, so publishing to a DSDS consumer is a pass-through apart from two named extensions, `may` and `instead`.
- A DSDS consumer that drops unknown fields keeps every prohibition and loses every `instead` remedy. Any export path has to decide whether to fold the remedy into the statement rather than emit a rule with its fix stripped off.
- A prohibition and its remedy are one entry, so neither can be deleted without the other and a reader cannot act on the first without seeing the second.
- Selection guidance stops being prose. `useWhen` and `dontUseWhen` give a reader the scannable table of what each token, prop, or variant is for — and leave the rules section short enough to read in full.
- The boundary between a `dontUseWhen` subject and a `must-not` rule is a judgment with no mechanical test. `foundations/color.yaml` already states the ramp-step prohibition in both places, so the duplication is live rather than hypothetical.
- `meta.status` makes the difference between proposed and ratified guidance a field rather than a convention, which is what a ratification step needs to read.
- `meta.author` and `meta.updated` duplicate git and will go stale. Nothing in the validator can catch that.
- Obligation is a sortable, filterable, renderable field instead of the first word of a sentence, which is what a documentation pipeline needs to group `must` rules apart from `should` ones.
- `ComponentConcern`, `Platform`, and `FoundationConcern` close, so #870's reference checks run against known value sets and a misspelled concern fails validation rather than creating a silent section.
- Guidance gains a verification story through `checkedBy` and `checks`, and an `automated` guideline cannot be authored without naming what automates it.
- The overlay-only discipline now applies to half the sidecar. `guidelines.yaml` has no `schemaGap`, so nothing mechanical stops a guideline that should have been a spec field — that judgment moves to review.
- The hazard `regenerationRisk` recorded loses its home. That an overlay rides an emitted BEM class, and goes silent if the class changes, is true of several `button` entries and is no longer written down anywhere.
- Two of the three scopes ship without an authored file behind them, and conflicting obligation levels across scopes are an authoring error no validator catches.
- `Platform` and `Conventions.platforms` name iOS differently — `ios` here, `swiftui` in the conventions example keys. The divergence is deliberate and costs nothing while it holds: `Conventions.platforms` is an open map keyed by implementation id, where a framework name is the right granularity, and `Platform` is a closed enum naming emission targets, where the platform is. It would start to bite only if a second sanctioned framework appeared on iOS or Android, which the workspace's platform-examples policy rules out — Swift with SwiftUI and Kotlin with Jetpack Compose, one each. The web is the side with two, and that is exactly why `web` exists as a group.


---

## References

- **Design System Documentation Specification (DSDS) 0.23.1** — [designsystemdocspec.org/specification](https://designsystemdocspec.org/specification). Source of the `guidelines.yaml` entry shape adopted under D7: the `statement` / `level` / `checkedBy` / `checks` field names, the `must` / `should` / `should-not` / `must-not` level set, the `automated` / `assisted` / `manual` verification set, and the `checks`-required-when-`automated` rule. Three deliberate departures, each argued where it is made: `may` is added to the level set (D7), `instead` is added to the entry (D7), and the section-level `for` audience of `all` / `human` / `agent` is not adopted (Notes). `useWhen` / `dontUseWhen` (D11) and `meta` (D12) have no DSDS counterpart and are drawn from authored content instead.
- **RFC 2119** — the obligation semantics DSDS's `level` values carry, and the source of the added `may`.
- **`packages/cli/src/validate/supplemental.schema.json`** — the experimental CLI-defined contract this ADR promotes, splits, and deletes.
- **`DirectedEdges/spectacular#870`** — the validation work this ADR unblocks.
- **component-marathon workspace, `specs/components/{badge,button,icon,image}/supplemental.yaml` and `specs/foundations/color.yaml`** — the authored evidence the shape is drawn from.
