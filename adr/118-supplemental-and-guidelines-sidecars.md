# ADR: Three Authored Documents Beside a Spec — `supplemental.yaml`, `guidelines.yaml` and `tokens.yaml`

**Branch**: `118-supplemental-and-guidelines-sidecars`
**Created**: 2026-11-09
**Status**: DRAFT
**Summary**: `SupplementalDocument`, `GuidelinesDocument` and `TokensDocument` join the concern documents as authored siblings, divided by what each states.
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

**A fifth authored file has already run ahead of the shape.** `specs/foundations/color.yaml` is authored, not generated — it carries `status: proposed`, an author, and a `sources:` list naming the generated reports it was synthesized from. It is the most developed guidance in the workspace, and it disagrees with the component documents on four points. It opens with a `meta` header (`concern`, `status`, `author`, `updated`, `sources`). It carries `useWhen` and `dontUseWhen` — token tables with a per-token `$description` saying what each token is for — which no component file has. Its `guidelines` entries key the obligation instead of naming it, and pair a prohibition with its remedy in one entry (`never:` alongside `must:`). And it uses five obligation words where the component files use three: `must`, `should`, `never`, `warn`, and `could`.

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

Thirteen decisions are recorded below, each with its own alternatives. The Decision section that follows introduces nothing that is not chosen here.

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

### D3 — The concern vocabulary

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

**The path was never what the emitters read.** `icon` and `image` both state that the emitter redirects its stories to the authored `component.tsx` *because the entry names it*. That is false, and checking the emitter source settles it: no file in `specs-transforms` mentions `supplemental` at all.

The naming rule already exists and is already implemented. `packages/from-specs/src/naming.ts` declares `REACT_FILES.authored` as `component.tsx` and `WEBCOMPONENT_FILES.authored` as `component.ts`, each commented "Authored by the workspace; wins over the scaffold when present". Both emitters act on it by testing for the file beside the scaffold — in `Spec/instances.ts`, and in `Stories/Stories.ts` and `Stories/WcStories.ts` where the story import is chosen. It is documented in three more places: the docs site's `code/index.md`, `code/scaffold.mdx` and `code/stories.mdx`, and the `component.author` skill, which tells an author to implement beside the emitted output rather than editing it.

> An emitter looks for `component.<ext>` beside the scaffold it generates, in the platform's own tree. If that file exists, the emitter imports it in place of the scaffold and points the generated stories at it. `.tsx` for React, `.ts` for Web Components. Nothing in the spec or either sidecar names the file.

So the field being removed was documentation that happened to agree with a convention, not an input to it. All four authored files already use the two names the convention expects, which is why nothing observable changes.

**Cons / Trade-offs**:
- A builder arriving at an entry no longer learns where it is implemented from the entry itself; they learn it from a convention they have to know.
- A convention is weaker than a declaration. A hand-written file under any other name is invisible to the emitter with no error — the scaffold is simply used instead, and the overlay silently stops applying. That was already true before this ADR, and removing the field neither causes it nor fixes it.

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

This decision is adopted from the Design System Documentation Specification (DSDS) 0.23.1, published at [designsystemdocspec.org/specification](https://designsystemdocspec.org/specification). DSDS's, not this ADR's: the item field names `statement`, `level`, `checkedBy`, `checks`, `evidence`, `alternatives`, and `refines`; the `must` / `should` / `should-not` / `must-not` value set; the `automated` / `assisted` / `manual` value set; the rule that `checks` is required when `checkedBy` is `automated`; and the pointer shape — either `to` for something inside the project or `href` for something outside it, never both.

What is ours: the decision to adopt rather than invent, the builder-versus-consumer split under D1 that DSDS does not model, and the additions declared below.

**One scope limit worth stating plainly.** A `guidelines.yaml` *item* is a DSDS guideline item. The *document* is not a DSDS document. DSDS requires `kind` and `for` on every section, and this ADR uses concern keys as the top-level map and rejects `for` (Notes). So the mapping is item-for-item and section-by-construction: an exporter wraps a concern's entries in a DSDS section, supplying `kind: guidelines` and `for: all`. Nothing is lost, but the document is a source format that maps cleanly to DSDS rather than DSDS itself, and earlier drafts of this ADR overstated that.

**The shape in practice.** One entry exercising every field, so the parts can be seen together rather than inferred from the options below:

```yaml
# components/badge/guidelines.yaml
accessibility:
  - statement: "Set accessibilityLabel on a badge whose slot holds no text child."
    level: must
    instead: "Give the badge a text child, if the design permits one."
    refines: { to: "components/guidelines.yaml#accessibility" }
    evidence: [{ href: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content" }]
    checkedBy: automated
    checks: [{ to: "react/src/components/Badge/a11y.test.tsx" }]
```

Read in order: *what* the rule is, *how hard* it binds, *what to do instead* when it is a prohibition, *which broader rule* it narrows, *why* anyone believes it, and *what proves* it still holds. Only the first two are required; an entry carrying just those is ordinary and correct.

The same entry if the remedy were a thing rather than a rule — the common case, and the one that needs no extension to DSDS:

```yaml
  - statement: "Use a badge for a value that changes while on screen."
    level: must-not
    alternatives: [{ to: "liveRegion" }]
    checkedBy: manual
```

#### Option A: DSDS item fields, DSDS levels plus `may`, DSDS `alternatives` for a nameable remedy, and `instead` for a prose one *(Selected)*

A guideline entry is a DSDS guideline item: `statement`, `level`, `checkedBy`, `checks`, `evidence`, `alternatives`, `refines`, each used as DSDS defines it. `level` is one of `must`, `should`, `should-not`, `must-not`, `may`.

The remedy for a prohibition is carried two ways, because the authored content contains two kinds of remedy:

- **`alternatives`** when the remedy is a *thing* — DSDS's own field, whose relationship is `alternative-to`, holding pointers rather than prose. A pointer has either `to`, naming something in the project, or `href`, naming something outside it, and MUST NOT have both. "Never use a glyph-only `button`" points at `iconButton`; "never style from `DE Palette/Red/44`" points at the semantic token that aliases it. This is the common case and it is native DSDS.
- **`instead`** when the remedy is a *rule*, not a thing. `color.yaml`'s "style from the semantic token that aliases the ramp step" names no single token — it names a layer to style from. A pointer cannot hold that sentence, so one extension field does.

Two additions to DSDS, both deliberate and both minimal:

- **`may`** is RFC 2119's fifth level and is absent from DSDS 0.23.1's four. `color.yaml` already needs it: its `could` entry — that the three `*inverse` tokens are meant to travel together whenever a surface is dark enough to flip content — is a permission, and recording it as `should` would assert an obligation the system does not hold.
- **`instead`** covers only the prose remedy above. **Export rule: when emitting DSDS, `instead` is appended to `statement` as a sentence, never dropped.** A consumer that ignores unknown fields then loses the field and keeps the content, which is the opposite of publishing a prohibition with its fix stripped off.

**Pros**:
- Every remedy that names a thing is expressed in DSDS's own field, so most pairs export with no extension at all.
- `alternatives` holds a pointer, which a validator can resolve — `instead` and a prose remedy cannot be checked against anything.
- One idea stays in one entry either way. A reader who hits the prohibition cannot miss the remedy, and the pair cannot drift apart or be half-deleted.
- RFC 2119 semantics are what the authored prose already reaches for in both the component files and `color.yaml`.
- `checkedBy` and `checks` give an obligation a verification story, which no field carries today.

**Cons / Trade-offs**:
- Two fields for one concept, and the line between them is a judgment: an author who could write a pointer may write prose instead, and nothing catches it. The rule is that `alternatives` is preferred whenever the remedy can be named, and that rule lives in the authoring skill, not the schema.
- `should-not` and `must-not` instead of the `never` the authored files use, so authoring is a small translation every time.
- `warn` has no level. `color.yaml` uses it as a key and one `badge` entry carries it mid-sentence; both become `should-not` with the hazard explained in the statement, which loses the distinction between "this is inadvisable" and "this will surprise you". Accepted.
- The export rule is a normative requirement on a tool this ADR does not write. Nothing enforces it until an exporter exists.

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

**What the authored data actually holds, and what it becomes.** Three entries from `button` and `icon`, each a real `regenerationRisk` value:

```yaml
# 1. button, the press-scale entry — a grade, a dependency list and an
#    instruction in one string
regenerationRisk: "medium — declared in motion.css (React, imported by
  component.tsx) and inline in component.ts; keyed to the emitted `.button`
  class and the `:active:not(:disabled)` selector the states convention
  produces. Re-check the selector in styles.css after every re-emit."
# becomes
checkedBy: manual
checks: [{ to: "react/src/components/Button/motion.css" }]
```

The grade goes, because `medium` was never comparable across entries. The dependency list goes into `checks`, which can be resolved. The instruction — re-check the selector — has no home, and that is the loss this option accepts.

```yaml
# 2. icon, the aria-hidden entry — a grade plus a verification that a human
#    actually performed
regenerationRisk: "low — both emitters import an authored `component.*` beside
  the scaffold in place of the scaffold itself, so the emitted stories exercise
  these files (verified in the emitted stories' imports). Re-check both imports
  after every re-emit."
# becomes
checkedBy: assisted
checks: [{ to: "react/src/components/Icon/stories.tsx" }]
```

`assisted` is the honest value: a tool shows the emitted imports, a human reads them. Nothing in the old field could say that.

```yaml
# 3. badge, every guideline entry — a grade with no ledger behind it at all
regenerationRisk: "none — spec-folder file, generate never writes it"
# becomes
# (nothing — the field is simply absent)
```

Eight of `badge`'s nine entries say `none` or `pending`. That is the field reporting that it had nothing to record, eight times, and `checkedBy` being optional says the same thing by saying nothing.

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

**Three kinds of target, all present in the authored files.** The split matters because only the first can be resolved mechanically:

```yaml
# 1. A JSON Schema pointer — resolvable, so DSPEC-58 can check it exists
schemaGap:
  path: styles.schema.json#/definitions/Styles
  need: "the property set carries no transition, duration, easing or delay key,
    so no variant delta can state how a style change is traversed — only its
    endpoints"
```

```yaml
# 2. A generated report — the gap is in the library's data, not the contract.
#    Checkable for existence only
schemaGap:
  path: analysis/foundations.yaml
  need: "the library publishes colour, dimension, string and typography tokens
    only; no duration or easing token exists to reference"
```

```yaml
# 3. A conventions key — the declaration exists but nothing reads it
schemaGap:
  path: conventions.specs.accessibility.label
  need: "the convention declares the prop name, and no emitter binding reads it"
```

Case 2 is why `path` is not restricted to schema pointers. A missing motion token is a real gap, and forcing it to name `styles.schema.json` would point at the wrong thing — the schema can express a duration; the library has none to express.

And the entries that have no gap at all are the tell this field exists to catch:

```yaml
# From image — `schemaGap` opening with "none" means the entry is in the wrong
# file. The visual IS spec-carried; only the failure case is not
schemaGap: "none for the visual — the fallback is spec-carried as root's
  backgroundColor. The gap is the failure case: no surface reacts to an image
  whose bytes fail to load"
```

Under the object form this cannot be written. The entry either names the surface that fails — in this case there is none, because no schema surface models a load error — or it is split, with the spec-carried half deleted and the failure case keeping the entry.

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

**The tree as it fills in.** The marathon workspace today, plus where the next files land — the authored sidecars marked, everything else already generated or specced:

```
specs/
├── analysis/                       # generated; nothing authored here
│   ├── foundations.yaml
│   ├── styling.byToken.yaml
│   └── …
├── foundations/
│   ├── color/
│   │   ├── guidelines.yaml         # authored — how colour is applied
│   │   ├── tokens.yaml             # authored — what each colour token is for
│   │   └── supplemental.yaml       # authored — e.g. no motion token exists
│   ├── typography/
│   │   ├── guidelines.yaml         # authored
│   │   └── tokens.yaml             # authored
│   └── space/
│       └── tokens.yaml             # authored — a scale needs no rules yet
└── components/
    ├── guidelines.yaml             # authored — every component
    ├── supplemental.yaml           # authored — every component
    ├── badge/
    │   ├── api.yaml                # generated
    │   ├── variants.yaml           # generated
    │   ├── styling.yaml            # generated
    │   ├── examples.yaml           # generated
    │   ├── guidelines.yaml         # authored
    │   └── supplemental.yaml       # authored
    └── button/
        └── …
```

A foundation directory holds the same filenames a component directory does, plus `tokens.yaml`, which is foundation-only (DSPEC-63). That is the symmetry the suffixed form in Option B gave up.

Two things the tree is meant to show. Only concerns a system has something to say about get a directory — eight are available and three exist here, because nothing has been written about shape, elevation, brand, motion or layout yet, and an absent directory is not a gap to fill. And within a directory, each file is independent: `space/` has token descriptions and no rules because the scale needs none yet, while `color/` has all three.

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

### D11 — Where per-token description lives

`foundations/color.yaml` carries two sections the component documents have no equivalent of. Each lists tokens with a `$description` saying what that token is for, or why it is off-limits:

```yaml
# foundations/color.yaml, as authored today
useWhen:
  tokens:
    - { $token: "DE Color/Text/Primary", $description: "default body and label text on any light surface" }
    # … twenty-nine more
dontUseWhen:
  tokens:
    - { $token: "DE Palette/*", $description: "a raw ramp step — styling from a ramp bypasses the layer that carries intent and theming" }
```

**A description is not a rule.** A rule binds a reader: disregard it and the usage is wrong. A description constrains nobody — it says what a thing is for and leaves the reader to decide. Putting both in one document conflates two kinds of statement, and the practical cost shows up in `color.yaml` itself: thirty-six token descriptions sit above eleven rules, so the rules are the part nobody reaches.

The rules in that file are about **how colour is applied across the catalogue** — style from the semantic layer rather than a ramp, pair an `Alert` family's background with its own element, take an interaction colour from the `Action` family. Those generalise over themes, raw values, and experiments. None of them is about one token.

#### Option A: Per-token tables become their own document *(Selected)*

A foundation's `guidelines.yaml` carries rules only. The tables move to `foundations/<concern>/tokens.yaml`, whose shape is two flat lists of tokens — no concern keys, no obligation levels, nothing that pretends to bind.

```yaml
# foundations/color/tokens.yaml — description, no obligation
meta:
  concern: color
  status: proposed
useWhen:
  - $token: "DE Color/Text/Primary"
    $description: "default body and label text on any light surface"
dontUseWhen:
  - $token: "DE Palette/*"
    $description: "a raw ramp step — styling from a ramp bypasses the layer that carries intent and theming"
    alternatives: [{ to: "DE Color/Alert/Error/Background" }]
  - $token: "DE Color/Utility/Figma/*"
    $description: "Figma plugin and panel chrome, not product surfaces"
    # no alternatives — nothing replaces it; it is simply not for product
```

```yaml
# foundations/color/guidelines.yaml — rules only, and they generalise
styles:
  - statement: "Style any property from a `DE Palette/*` or `DE Palette Brand 2/*` ramp step."
    level: must-not
    instead: "Style from the semantic token that aliases the ramp step."
  - statement: "Pair an `Alert/<family>/Background` with that same family's `Element` for every text and glyph on it."
    level: must
  - statement: "Take an interaction colour from the `Action/*` family on whatever property expresses it."
    level: must
    instead: "The family is a state axis, not a property axis — never reach into `Text/*` or `Surface/*` for a lighter step."
```

The `dontUseWhen` table keeps `alternatives`, and that is where the DSDS pointer earns the most: an off-limits token almost always has a nameable replacement, and absence then says something true — nothing replaces it.

**Pros**:
- Each document makes one kind of statement, so a reader knows what they are holding before they start.
- A foundation's rules become readable. Eleven rules in a file of eleven rules is a document someone finishes.
- Thirty-six descriptions stay a scannable table rather than becoming thirty-six weak `should` entries, which was the other way to lose them.
- The tables and the rules are reviewed on different cycles — a token list changes when the library does, a rule changes when the system's position does — and separate files make that visible in the diff.

**Cons / Trade-offs**:
- A third authored document kind, where this ADR previously had two. Three schemas, three type files, three docs pages.
- `tokens.yaml` is foundation-scope only (DSPEC-63), so `badge`'s "choose colour for the status reported, not decoration — the options are the Alert families" has no table to go in. It stays a `should` rule, which is where the authored file already has it.
- The boundary is still a judgment with no mechanical test. "Never style from a ramp step" exists in `color.yaml` both as a `dontUseWhen` token and as a rule, and that duplication is now across two files rather than two sections of one.

#### Option B: First-class sections on `guidelines.yaml` *(Rejected)*

`useWhen` and `dontUseWhen` sit beside the concern keys, as the authored file has them, keyed by subject kind so a component could carry `props` and `variants` tables too.

**Rejected because**: it keeps a rule and a description in one document, and the authored file already shows what that costs — the rules are outnumbered three to one and read last. The speculative component-scope kinds made it worse: `props`, `variants` and `slotFills` had no authored instance, so three quarters of the shape was invented.

#### Option C: Convert each token to a rule *(Rejected)*

**Rejected because**: it trades the one table a reader scans first for thirty-six rules nobody reads to the end of, and it asserts an obligation where the source only described a purpose.

---

### D12 — The `meta` header

#### Option A: Adopt it as authored *(Selected)*

Both documents open with `meta`: `concern`, `status`, `author`, `updated`, and `sources`.

**In place, as the head of a document that continues.** The block is five lines at the top of a file whose body runs for a hundred, so it is only worth judging in that position:

```yaml
# foundations/color/guidelines.yaml
meta:
  concern: color
  status: proposed
  author: Nathan Curtis
  updated: 2026-11-06
  sources:
    - analysis/foundations.yaml
    - analysis/styling.byToken.yaml
    - analysis/styling.byComponent.yaml
    - config/conventions/figma.primitives.yaml

useWhen:
  tokens:
    - { $token: "DE Color/Text/Primary", $description: "default body and label text on any light surface" }
    # … twenty-nine more

styles:
  - statement: "Style any property from a `DE Palette/*` ramp step."
    level: must-not
    instead: "Style from the semantic token that aliases the ramp step."
    # … ten more
```

`status: proposed` is the line a ratifier reads first and the only thing in the workspace that distinguishes a draft from settled guidance. `sources` is what a reviewer needs to check the synthesis against, and what tells a later run which inputs have moved since.

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

### D13 — What a token pointer names

D7 and D11 both let a pointer name a token: a guideline's `alternatives`, and a `dontUseWhen` subject's. A DSDS pointer's `to` names an entry by its id, and a token id may use capitals and slashes but **must not contain a space** — the rule is that an id is lowercase words joined by dashes with dots between parts, and that *"a token's `id` MAY also use a design tool's own capitals and slashes, like `Color/Action/Primary`"*. Figma names are full of spaces. Every one of `DE Color/Action/Hover background`, `DE Color/Text/Primary Inverse`, `DE Color/Surface/Very low contrast`, and the collection `DE Palette Brand 2` is unusable as written.

DSDS specifies nothing about design-tool translation — no rule for spaces in tool names, no round-tripping guidance, no mapping from a DTCG path to an id. It does supply two pieces that together answer the question. Its processing model defines a name-to-identifier algorithm — *"lowercase the text, turn each run of characters other than `a`–`z` and `0`–`9` into one dash, and remove any dash at either end"* — and every entry carries `name`, the readable label, separate from `id`, the machine key.

#### Option A: Derive the id from `spec.tokens`, normalizing only when the result is not legal *(Selected)*

Authored content is unaffected: a `to` in an authored `alternatives` carries the token path exactly as the rest of the system spells it, because the authored document is a source format rather than a DSDS document (see D7's scope limit). The translation is the exporter's, in two parts:

> A DSDS exporter derives a token's `id` from whatever the workspace's `spec.tokens` profile emits for that token. If the result is not a legal DSDS id, it is normalized with DSDS's own algorithm, applied per path segment so the slashes a token id is permitted to keep are kept. The exporter MUST also emit the token's original path as `name`, unmodified.

**Where the value comes from, and what happens to it.** One token, traced end to end. Nothing here is new machinery — the first two rows already happen on every run:

| Stage | Value | Who produces it |
|---|---|---|
| Figma variable | name `Action/Hover background`, in collection `DE Color` | The library |
| Spec and report | `DE Color/Action/Hover background` | `tokenPath()` in the CLI's foundations analyzer, which joins the collection name to the variable name |
| Authored in a sidecar | `to: "DE Color/Action/Hover background"` | A human, spelling it exactly as every other token reference in the system does |
| Validated | resolved against `analysis/foundations.yaml` by that same path (DSPEC-57) | The CLI validator |
| Exported to DSDS | `name: "DE Color/Action/Hover background"` and `id: "de-color/action/hover-background"` | A DSDS exporter, which does not exist yet |

So an author writes one spelling, the one already in their fingers, and the derived identifier appears only in an exported document:

```yaml
# foundations/color/guidelines.yaml — what a human writes
dontUseWhen:
  tokens:
    - $token: "DE Palette/Red/44"
      $description: "a raw ramp step"
      alternatives: [{ to: "DE Color/Alert/Error/Background" }]
```

```yaml
# what a DSDS export would carry — id derived, name preserved
- kind: token
  id: de-color/alert/error/background
  name: DE Color/Alert/Error/Background
```

The transform folds case and collapses every run of non-alphanumeric characters to one dash, so it is many-to-one and cannot be reversed. `name` is what makes that safe. Run across all 272 tokens in the component-marathon library, it produces 272 distinct ids — including the case-only pair `DE Color/Text/Primary Inverse` and `DE Color/Icon/Primary inverse`, which stay apart because their groups differ. That is a fact about this library, not a guarantee, which is why DSPEC-60's exporter needs a collision check that fails loudly.

`spec.tokens` is already this system's single answer to how a token is named for a given consumer — eight profiles behind one enum, settled by ADR-007. A `tokens` profile a team has already chosen is a better source for their ids than a scheme invented here.

**Pros**:
- One naming authority. A team on `FIGMA_SYNTAX_IOS` gets `DSColor.alertInfoBg` as the id, which is already legal and already what they use; a team on the default gets `ds-color/alert/info/background`.
- The algorithm is DSDS's own, not this ADR's, so there is nothing to defend and nothing to keep in sync with a spec revision.
- `name` carries the original path, so the transform never has to be reversed. It cannot be — case folding and the collapse of every non-alphanumeric run into one dash make it many-to-one — and `name` means that does not matter.
- Nothing authored changes, no spec output changes, and the `tokens` setting is not touched. The slug exists only inside an exported document.
- Verified against the component-marathon library: all 272 tokens slug to distinct ids under this rule, including the case-only pair `DE Color/Text/Primary Inverse` and `DE Color/Icon/Primary inverse`, which stay distinct because their groups differ.

**Cons / Trade-offs**:
- `spec.tokens` is a Pro setting, so the id a given library exports depends on the workspace's entitlement and configuration. Two workspaces can export the same library with different ids.
- Zero collisions is a fact about one library, not a guarantee. A library with two tokens in one group differing only by case or punctuation would collide, and the exporter needs a collision check that fails loudly rather than silently merging two tokens.
- A pointer in an authored file holds a token path, while the same field in the exported document holds an id. The field means something slightly different on each side of the exporter, and only the scope limit in D7 makes that coherent.
- The rule binds an exporter this ADR does not write, so nothing enforces it yet.

#### Option B: Always slug the token path, ignoring `spec.tokens` *(Rejected)*

**Rejected because**: it adds a ninth token naming scheme immediately outside the single setting built to hold the other eight, and a team whose tokens genuinely are `--ds-color-alert-info-bg` would receive ids matching nothing they use. Configuration-independent output is a real benefit, but not one worth a second naming authority.

#### Option C: Add a `DSDS` profile to `spec.tokens` *(Rejected)*

**Rejected because**: `spec.tokens` shapes spec output, so a new profile changes every token reference in every spec, and promote-primitives tables match against whatever the profile emits. That is a far larger blast radius than an export format needs, and it would put a DSDS concern inside the spec contract rather than at the boundary where it belongs.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `SupplementalDocument.ts` *(new)* | Add `SupplementalDocument`, `SupplementalEntry`, `SupplementalMeta`, `SupplementalStatus`, `SupplementalConcern` (D3), `SupplementalCheckedBy` (D8), `SupplementalCheck`, `SchemaGap` (D9), `Platform` (D6), `FoundationConcern` (D10) | MINOR |
| `GuidelinesDocument.ts` *(new)* | Add `GuidelinesDocument`, `GuidelineEntry`, `GuidelinesMeta`, `GuidelinesStatus`, `GuidelinesConcern`, `GuidelinesCheckedBy`, `GuidelineReference`, `ObligationLevel` (D7) | MINOR |
| `TokensDocument.ts` *(new)* | Add `TokensDocument`, `TokensMeta`, `TokensStatus`, `TokenSubject`, `TokenPointer`, `TokenRef`, `TokenRefRelationship` (D11) | MINOR |
| `index.ts` | Re-export every type above | MINOR |

**On the file layout: three siblings, no parent.** An earlier draft put the vocabulary the documents share into a `Sidecar.ts`, with a `sidecar.schema.json` beside it. That is gone. "Sidecar" named a position rather than a kind — plenty of things sit beside other things — and a shared parent is exactly the wrong shape for three documents that are peers.

So each document file is self-contained, and the repetition is deliberate. `SupplementalMeta`, `GuidelinesMeta` and `TokensMeta` are three structurally identical headers. `SupplementalCheckedBy` and `GuidelinesCheckedBy` are the same three values twice. `SupplementalCheck`, `GuidelineReference` and `TokenPointer` are the same `to`/`href` pair three times.

The gain is that each schema validates standalone, with no `$ref` reaching across files, and each type file reads start to finish without opening another. The cost is that a change to the shared idea — a fourth `CheckedBy` value, say — has to be made in three places, and nothing enforces that it is. That is a real maintenance hazard and it is accepted knowingly.

This also satisfies the constitution digest's rule that enums have no separate file: every closed set now lives in the one document file that uses it.

**Example — new shape** (`types/SupplementalDocument.ts`):
```yaml
SupplementalDocument:
  meta?: SupplementalMeta
  # One optional key per SupplementalConcern, each a list of entries.
  # No concern key is required; an empty document is valid.
  "[concern: SupplementalConcern]"?: SupplementalEntry[]

SupplementalMeta:
  concern?: string                # restates the directory at the component and foundation scopes
  status?: SupplementalStatus     # 'proposed' | 'ratified' | 'deprecated'
  author?: string
  updated?: string                # YYYY-MM-DD
  sources?: string[]              # the generated reports this was synthesized from

SupplementalEntry:
  intent: string                  # required — a testable statement, no rationale prose
  schemaGap: SchemaGap            # required — the overlay-only gate
  platforms?: Platform[]          # absent = applies to every platform
  checkedBy?: SupplementalCheckedBy
  checks?: SupplementalCheck[]    # required when checkedBy is 'automated'

SchemaGap:
  path: string                    # JSON Schema pointer, or any repo-relative target
  need: string                    # what that target cannot carry, and why

# DSDS's pointer shape: `to` inside the workspace, `href` outside it.
# Exactly one, never both (schema-enforced).
SupplementalCheck:
  to?: string
  href?: string

SupplementalCheckedBy: 'automated' | 'assisted' | 'manual'
```

**Example — new shape** (`types/GuidelinesDocument.ts`):
```yaml
GuidelinesDocument:
  meta?: GuidelinesMeta
  # Rules only. Per-token tables are TokensDocument's — see D11.
  "[concern: GuidelinesConcern]"?: GuidelineEntry[]

GuidelineEntry:
  statement: string               # required — the rule, DSDS field name
  level: ObligationLevel          # required — RFC 2119 semantics
  alternatives?: GuidelineReference[]  # the remedy when it names a thing — DSDS `alternative-to`
  instead?: string                # the remedy when it names a rule, not a thing
  refines?: GuidelineReference    # elaborates another guideline — DSDS
  evidence?: GuidelineReference[] # source material supporting the rule — DSDS `cites`
  checkedBy?: GuidelinesCheckedBy
  checks?: GuidelineReference[]   # required when checkedBy is 'automated'

# DSDS 0.23.1's four, plus RFC 2119's `may` — see D7 for why
ObligationLevel: 'must' | 'should' | 'should-not' | 'must-not' | 'may'
```

**Example — new shape** (`types/TokensDocument.ts`):
```yaml
TokensDocument:
  meta?: TokensMeta
  useWhen?: TokenSubject[]        # what each token is for
  dontUseWhen?: TokenSubject[]    # which are off-limits, why, and what replaces them

TokenSubject:
  $token: string                  # required — the library's own path, spaces and capitals included
  $description: string            # required — what it is for, or why it is off-limits
  alternatives?: TokenPointer[]   # dontUseWhen: what to use instead; absence means nothing replaces it
  refs?: TokenRef[]               # DSDS `same-as` when this restates a token at another scope

TokenPointer:
  to?: string
  href?: string

# A pointer carrying an explicit relationship, as DSDS's `refs` array requires
TokenRef:
  to?: string
  href?: string
  rel: 'same-as' | 'relates-to' | 'source' | 'design' | 'demo'
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `supplemental.schema.json` *(new)* | The `SupplementalDocument` contract; `additionalProperties: false` closes the key set to `SupplementalConcern` plus `meta` | MINOR |
| `guidelines.schema.json` *(new)* | The `GuidelinesDocument` contract; the same closed concern set plus `meta`, and nothing else | MINOR |
| `tokens.schema.json` *(new)* | The `TokensDocument` contract: `meta`, `useWhen`, `dontUseWhen` | MINOR |
| `package.json` | Add `./schema/supplemental`, `./schema/guidelines` and `./schema/tokens` to the `exports` map | MINOR |

Each of the three is self-contained: no `$ref` crosses a file, so each validates on its own and each repeats the header, verification and reference definitions. See the file-layout note above for why that repetition is deliberate and what it costs.

**Example — new shape** (`schema/supplemental.schema.json`):
```yaml
# Every closed set is oneOf branches of const, one per value, each described
# (DSPEC-48, DSPEC-49) — never a bare `enum` array
Platform:
  oneOf:
    - const: react
      description: "React, emitted by react-from-specs."
    - const: webcomponents
      description: "Lit web components, emitted by webcomponents-from-specs."
    - const: web
      description: "Both web targets at once; expands to react and webcomponents, and may not be named beside either."
    - const: ios
      description: "iOS, as Swift with SwiftUI."
    - const: android
      description: "Android, as Kotlin with Jetpack Compose."

# The platform group ban from D6, and the checks requirement from D8
SupplementalEntry:
  required: [intent, schemaGap]
  additionalProperties: false
  properties:
    platforms:
      type: array
      minItems: 1
      uniqueItems: true
      items: { $ref: "#/definitions/Platform" }
      # `web` expands to both web leaves, so naming it beside either is contradictory
      not:
        allOf:
          - contains: { const: web }
          - anyOf:
              - contains: { const: react }
              - contains: { const: webcomponents }
  if:    { properties: { checkedBy: { const: automated } }, required: [checkedBy] }
  then:  { required: [checks] }
```

**Example — new shape** (`schema/guidelines.schema.json`):
```yaml
# Each description names the colloquial words an author reaches for, because
# those are the words the authored files already use — the level is what those
# words mean, not a vocabulary competing with them.
ObligationLevel:
  oneOf:
    - const: must
      description: "An absolute requirement; a usage that disregards it is wrong. Often written instead as required, or always."
    - const: should
      description: "A strong recommendation; disregard it only with a considered reason. Often written instead as recommended, or prefer."
    - const: should-not
      description: "A strong recommendation against; do it only with a considered reason. Often written instead as avoid."
    - const: must-not
      description: "An absolute prohibition; a usage that does it is wrong. Often written instead as never."
    - const: may
      description: "A permission the system grants and neither requires nor discourages. Often written instead as optional, or could."

GuidelineEntry:
  required: [statement, level]
  additionalProperties: false
  properties:
    level: { $ref: "#/definitions/ObligationLevel" }
    instead: { type: string, minLength: 1 }
    alternatives: { $ref: "#/definitions/GuidelineReferences" }
  if:    { properties: { checkedBy: { const: automated } }, required: [checkedBy] }
  then:  { required: [checks] }

# DSDS: a pointer has `to` or `href`, and MUST NOT have both. Declared in each
# of the three files under its own name — see the file-layout note above.
GuidelineReference:
  additionalProperties: false
  properties: { to: { minLength: 1 }, href: { format: uri } }
  oneOf:
    - required: [to]
    - required: [href]
```

**Example — new shape** (`schema/tokens.schema.json`):
```yaml
# Flat lists, not keyed by subject kind: this document is tokens only
TokensDocument:
  additionalProperties: false
  properties:
    meta:        { $ref: "#/definitions/TokensMeta" }
    useWhen:     { type: array, items: { $ref: "#/definitions/TokenSubject" } }
    dontUseWhen: { type: array, items: { $ref: "#/definitions/TokenSubject" } }

TokenSubject:
  required: [$token, $description]
  additionalProperties: false
  properties:
    $token:       { minLength: 1 }
    $description: { minLength: 1 }
    alternatives: { type: array, items: { $ref: "#/definitions/TokenPointer" } }
    refs:         { type: array, items: { $ref: "#/definitions/TokenRef" } }
```

### Specification changes (`packages/schema/SPECIFICATION.md`)

§1.5 declares document kinds and identity fully specified in the specification, so three new document kinds land there rather than in the reference pages alone.

| Section | Change |
|---|---|
| §2.1 Document kinds | Three rows: Supplemental, Guidelines and Tokens, each naming its schema file |
| §2.1 Document kinds | A paragraph distinguishing generated documents from authored ones, since the existing six are all generated |
| §2.1 Document kinds | A paragraph stating that the three authored kinds are siblings with no parent kind, that each schema is self-contained, and that the repetition is deliberate |
| §2.1 Document kinds | A list dividing the three by *what kind of statement* each makes — a requirement on a builder, a rule binding a user, a description of a thing — since that is the division, not what they are about |
| §2.3 Required members | A carve-out: an authored document carries no `metadata.source`, because it was never generated from a Figma node. It carries `meta` instead, which records authorship and review status rather than provenance |
| §2.3 Required members | The prohibition that keeps D11 honest: a guidelines document carries no per-token tables, and a tokens document carries no rules |
| §9 Rule catalogue | Eight rows, `DSPEC-56` through `DSPEC-63`, below |

The rules JSON Schema cannot express, each stated in the specification rather than left in this ADR, since §1.6 binds no consumer to an ADR:

| Rule | Statement | Class |
|---|---|---|
| `DSPEC-56` | A supplemental or guidelines document at the catalogue scope and one at the component scope both apply; neither overrides the other, and an entry is a statement about a subject rather than a value at a key | consumer |
| `DSPEC-57` | A reference's `to` resolves to something that exists in the workspace — a token in `analysis/foundations.yaml`, a component, or an item within one | validator |
| `DSPEC-58` | A `schemaGap.path` that is a JSON Schema pointer resolves against the named schema file | validator |
| `DSPEC-59` | An exporter emitting DSDS appends `instead` to `statement` as a sentence and never drops it | producer |
| `DSPEC-60` | An exporter derives a token's DSDS `id` from the workspace's `spec.tokens` profile, normalizing per path segment only when that output is not a legal id | producer |
| `DSPEC-61` | An exporter emits a token's original path as `name`, unmodified, so the derived `id` never has to be reversed | producer |
| `DSPEC-62` | A directory under `foundations/` is named from the `FoundationConcern` vocabulary. This is the rule that gives `FoundationConcern` an enforcement home: it governs a path, and a document schema validates contents rather than the path that selected it | validator |
| `DSPEC-63` | A `tokens.yaml` is written at the foundation scope only, because a token belongs to a foundation rather than to any component | validator |

The authored-override naming rule from D5 — `component.tsx` or `component.ts` beside the scaffold — gets no rule id here. It binds the transform packages' emitters, not a Specs document, so it belongs in those packages' own documentation. The preference for `alternatives` over `instead` likewise stays in the authoring skill: it is guidance to an author, not a requirement on a document.

### CLI changes (`packages/cli/`)

| File | Change |
|------|--------|
| `src/validate/supplemental.schema.json` | Deleted — superseded by the published schema |
| `src/validate/supplemental.ts` | Compile the published `supplemental.schema.json` and a new `guidelines.schema.json` instead of the local copy |
| `src/validate/run.ts` | Validate `guidelines.yaml` wherever it validates `supplemental.yaml`, at all three scopes from D10, and `tokens.yaml` at the foundation scope only (DSPEC-63) |
| `src/validate/references.ts` | Resolve a `schemaGap.path` that is a JSON Schema pointer; check a `useWhen` / `dontUseWhen` `$token` against the library the way `$token` is already checked in specs; resolve every `Pointer.to` in `alternatives`, `refines`, `evidence`, and `checks`, matching a token pointer against `analysis/foundations.yaml` by its authored path rather than any derived id |
| `src/skills/*.md` | Update the authoring skills that describe the sidecar's shape |

The reference-level checks issue #870 asks for land here, against the closed enums this ADR provides: an entry citing an anatomy element or prop must cite one that exists in the sibling `api.yaml`, and a `schemaGap.path` that is a JSON Schema pointer must resolve.

### Notes

**On the package #870 names.** The issue says the validator "lands in specs-schema-core". No such package exists — `spectacular/packages/` holds `schema` and `cli` only. This ADR reads that as the schema package's core contract and places the types and schema files in `packages/schema`, leaving the validator itself in the CLI, since Constitution II bars logic from the schema package.

**On what stays out of v1.** DSDS's section-level `for` audience of `all` / `human` / `agent` is not adopted as a field. The builder-versus-consumer split under D1 is the audience axis this schema needs, and `for: all` is what a DSDS export emits. An agent-only guideline is a real future case with no authored instance behind it. No `title` either — the three scope paths name their subject, and `meta.concern` restates it for a reader who has only the file.

**On the DSDS divergences, and the export rule that bounds them.** Three places depart from DSDS 0.23.1, each argued where it is made: `may` on `ObligationLevel` (D7), `instead` on `GuidelineEntry` (D7), and `$description` plus the `useWhen` / `dontUseWhen` sections, which have no DSDS counterpart at all (D11). The document shape is also not a DSDS document — see the scope limit in D7.

**A DSDS exporter is out of scope for this ADR, and is not deferred work.** No exporter exists, none is planned here, and nothing in this ADR produces one. What this ADR does is make an exporter cheap to write later by shaping the source so the mapping is mechanical — and by deciding the rules below now, while the reasoning is in front of us, rather than leaving them to whoever eventually writes one.

**Three normative requirements on any exporter this schema ever gets.** None is implementable here, because no exporter exists. All three are stated so the exporter is not guesswork.

1. **`instead` is appended to `statement` as a sentence, never dropped.** `alternatives` needs no such rule — it is DSDS's own field and survives intact. This one exists only for the prose remedy, so a consumer that ignores unknown fields loses the field and keeps the content rather than publishing a prohibition with its fix stripped off.
2. **A token's `id` is derived from the workspace's `spec.tokens` profile, normalized per path segment with DSDS's algorithm only when the profile's output is not a legal id** (D13).
3. **A token entry always carries its original path in `name`, unmodified.** The id transform is many-to-one and cannot be reversed; `name` is why it never has to be.

**On the authored files.** Five authored files need editing for this contract, all of them workspace content rather than package content, so none of it gates this ADR. The four `supplemental.yaml` files move their `guidelines` sections out, turn `schemaGap` strings into objects, drop `regenerationRisk`, drop the `platforms` map's file paths, and resolve the entries whose `schemaGap` reads `"none"` by moving them into the spec or justifying them. `foundations/color.yaml` moves to `foundations/color/guidelines.yaml` and converts its obligation keys to `level` values with `instead`.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes, and one-to-one. Each of the three type files has exactly one schema file, and neither side shares a definition across files — the parity is checkable per pair rather than through a common dependency.
- **Parity check**: `SupplementalDocument` ↔ `supplemental.schema.json` root; `SupplementalConcern` ↔ its closed `properties` key set; `SupplementalMeta` ↔ its `meta`; `Platform` ↔ the `platforms` array's branches; `SupplementalCheckedBy` ↔ its `checkedBy`; `SupplementalCheck` ↔ its reference definition; `SchemaGap` ↔ its `schemaGap`. `GuidelinesDocument` ↔ `guidelines.schema.json` root; `GuidelinesConcern`, `GuidelinesMeta`, `ObligationLevel`, `GuidelinesCheckedBy` and `GuidelineReference` ↔ their counterparts there. `TokensDocument` ↔ `tokens.schema.json` root; `TokensMeta`, `TokenSubject`, `TokenPointer` and `TokenRef` ↔ theirs.
- **Asymmetries, all deliberate**: three constraints are expressible in JSON Schema and not in TypeScript — `checks` required when `checkedBy` is `automated`; the ban on `web` appearing beside a web leaf; and exactly one of `to` or `href` on a reference, which is DSDS's own MUST NOT. Each is documented on its type as a constraint the schema enforces, so a reader of the types learns the rule even though the compiler will not apply it.
- **`FoundationConcern` has no schema counterpart**, deliberately. It governs a directory name under `foundations/`, and a document schema validates contents rather than the path that selected the document. DSPEC-62 is its enforcement home.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Update usage | Deletes its private schema copy, imports the three published schemas, validates `guidelines.yaml` at three scopes and `tokens.yaml` at the foundation scope, and gains #870's reference checks. The authoring skills' descriptions need rewriting. |
| `specs-from-figma` | None | Generate writes none of the three; all are authored. |
| `react-from-specs`, `webcomponents-from-specs` | None | `platforms` no longer carries a file path (D5), and neither emitter ever read it — no source file in `specs-transforms` mentions `supplemental`. The naming rule they do use is already implemented in `from-specs`'s `naming.ts` and already documented on the docs site and in the `component.author` skill. Verified, not assumed. |
| `figma-from-specs` | None | None of the three renders to canvas. |
| Spec workspaces | Author migration | Four marathon `supplemental.yaml` files need the edits listed in Notes. `foundations/color.yaml` moves to `foundations/color/guidelines.yaml`, its five obligation keys become `level` values with `instead` on the paired entries, and its `could` entry becomes `may`. |

---

## Semver Decision

**Target version**: `0.40.0` — the version of the active release branch this ADR merges into.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: Constitution III's versioning rule gives `MINOR` for additive types and new optional fields. Every change to `@directededges/specs-schema` here is additive: four new type files, two new schema files, two new `exports` entries, and nothing removed or renamed in the published surface. The shape changes that *are* breaking — `regenerationRisk` removed, `schemaGap` becoming an object, `guidelines` leaving the document — break a contract this package never published. It lives in `packages/cli/src/validate/supplemental.schema.json`, self-declared EXPERIMENTAL, and the authored files depending on it are workspace content. The CLI's own version carries that break.

---

## Consequences

- The content divides by what it states: builders read `supplemental.yaml`, consumers read `guidelines.yaml`, and a reader after a token's purpose reads `tokens.yaml`. None wades through another's entries.
- A `guidelines.yaml` entry is a DSDS 0.23.1 guideline item in field names and in four of five level values. The document around it is a source format that maps to DSDS section-by-section, not a DSDS document — an exporter supplies the `kind` and `for` that DSDS requires and this schema does not carry.
- A prohibition and its remedy are one entry, so neither can be deleted without the other and a reader cannot act on the first without seeing the second.
- Most remedies are now resolvable data rather than prose, because `alternatives` holds a pointer and most off-limits things have a nameable replacement. A validator can check that the replacement exists; it could never check a sentence.
- The absence of `alternatives` says something true: nothing replaces this. `color.yaml`'s four `Utility/*` families have no replacement and its ramp steps do, and that distinction is currently invisible in the authored file.
- Export *would be* lossless in content and lossy only in structure, and only for the prose remedy, because the normative rule folds `instead` into `statement`. Stated in the conditional deliberately: no exporter exists, writing one is out of scope here, and until one does the rule binds nothing.
- The schema does not enforce `alternatives` over `instead` when both would work. An author who writes prose where a pointer was available produces a valid document that is worse than it needed to be, and only review catches it.
- Selection guidance stops being prose. `useWhen` and `dontUseWhen` give a reader the scannable table of what each token, prop, or variant is for — and leave the rules section short enough to read in full.
- The boundary between a `dontUseWhen` subject and a `must-not` rule is a judgment with no mechanical test. `foundations/color.yaml` already states the ramp-step prohibition in both places, so the duplication is live rather than hypothetical.
- `meta.status` makes the difference between proposed and ratified guidance a field rather than a convention, which is what a ratification step needs to read.
- `meta.author` and `meta.updated` duplicate git and will go stale. Nothing in the validator can catch that.
- A token keeps one spelling everywhere a human writes it. The DSDS-legal id exists only inside an exported document, derived from the workspace's `spec.tokens` profile, and never enters a spec, a generator, or Figma.
- Because the id derives from a Pro setting, two workspaces can export the same library under different token ids. That is correct — it follows the naming each team already chose — but it means an id is not a stable cross-workspace identifier.
- The id transform is lossy and irreversible, and `name` carrying the original path is the only thing that makes it safe. An exporter that omits `name` produces a document whose tokens cannot be traced back to the library.
- Obligation is a sortable, filterable, renderable field instead of the first word of a sentence, which is what a documentation pipeline needs to group `must` rules apart from `should` ones.
- `SupplementalConcern`, `GuidelinesConcern`, `Platform`, and `FoundationConcern` close, so #870's reference checks run against known value sets and a misspelled concern fails validation rather than creating a silent section.
- Three structurally identical headers, two identical verification sets and three identical reference shapes now exist under different names. Changing the shared idea means changing it three times, and nothing checks that all three moved.
- A foundation's rules and its token descriptions are separate files, reviewed on separate cycles: a token list changes when the library does, a rule changes when the system's position does.
- Guidance gains a verification story through `checkedBy` and `checks`, and an `automated` guideline cannot be authored without naming what automates it.
- The overlay-only discipline now applies to half the sidecar. `guidelines.yaml` has no `schemaGap`, so nothing mechanical stops a guideline that should have been a spec field — that judgment moves to review.
- Where a hand-written override lives is recorded as a convention — `component.tsx` or `component.ts` beside the scaffold — and no longer also as a field that looked like an input but was not one. A file under any other name is invisible to the emitter and fails silently, with the scaffold used in its place; that was already the case and this ADR neither causes nor fixes it.
- The hazard `regenerationRisk` recorded loses its home. That an overlay rides an emitted BEM class, and goes silent if the class changes, is true of several `button` entries and is no longer written down anywhere.
- Two of the three scopes ship without an authored file behind them, and conflicting obligation levels across scopes are an authoring error no validator catches.
- `Platform` and `Conventions.platforms` name iOS differently — `ios` here, `swiftui` in the conventions example keys. The divergence is deliberate and costs nothing while it holds: `Conventions.platforms` is an open map keyed by implementation id, where a framework name is the right granularity, and `Platform` is a closed enum naming emission targets, where the platform is. It would start to bite only if a second sanctioned framework appeared on iOS or Android, which the workspace's platform-examples policy rules out — Swift with SwiftUI and Kotlin with Jetpack Compose, one each. The web is the side with two, and that is exactly why `web` exists as a group.


---

## References

- **Design System Documentation Specification (DSDS) 0.23.1** — [designsystemdocspec.org/specification](https://designsystemdocspec.org/specification). Source of the guideline item shape adopted under D7: the `statement` / `level` / `checkedBy` / `checks` / `evidence` / `alternatives` / `refines` field names, the `must` / `should` / `should-not` / `must-not` level set, the `automated` / `assisted` / `manual` verification set, the `checks`-required-when-`automated` rule, and the pointer shape — `to` or `href`, never both. `alternatives` carries DSDS's `alternative-to` relationship and is valid on a guideline item; D11 extends its use to a `dontUseWhen` subject. `same-as` and `relates-to` are available via `refs` and used as DSDS defines them.

  Departures, each argued where it is made: `may` added to the level set (D7); `instead` added for a prose remedy (D7); the section-level `for` audience not adopted (Notes); and `useWhen` / `dontUseWhen` with `$description` having no DSDS counterpart at all (D11). The document shape is a source format that maps to DSDS rather than DSDS itself, because DSDS requires `kind` and `for` on a section and this schema carries neither — see the scope limit in D7. `meta` (D12) is drawn from authored content, not DSDS.
- **DSDS processing model** — [designsystemdocspec.org/processing](https://designsystemdocspec.org/processing). Source of the name-to-identifier algorithm adopted under D13: lowercase, each run of characters other than `a`–`z` and `0`–`9` becomes one dash, dashes at either end removed. The spec defines it for generating addresses from statements, terms, and titles; D13 applies it per path segment to a token path. The processing model also confirms pointer matching is exact, with no case-folding or normalization at resolution time.
- **RFC 2119** — the obligation semantics DSDS's `level` values carry, and the source of the added `may`.
- **`spec.tokens` setting** — `site/src/content/docs/settings/tokens.md`, decided by ADR-007. The eight token-naming profiles D13 derives a DSDS token id from.
- **`packages/cli/src/validate/supplemental.schema.json`** — the experimental CLI-defined contract this ADR promotes, splits, and deletes.
- **`DirectedEdges/spectacular#870`** — the validation work this ADR unblocks.
- **component-marathon workspace, `specs/components/{badge,button,icon,image}/supplemental.yaml` and `specs/foundations/color.yaml`** — the authored evidence the shape is drawn from.
