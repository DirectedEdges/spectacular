# ADR: `defaultFillWidth` — the Width a Fill-Width Root Fills

**Branch**: `adr/primitive-composition`
**Created**: 2026-08-31
**Status**: ACCEPTED
**Summary**: `defaultFillWidth` states the container width a platform gives a component whose root resizes to fill its parent.
**Decides**: layoutSizingHorizontal, maxWidth, width
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

Every platform in this pipeline eventually has to *show* a component, and a component whose root resizes to fill its parent has no parent when it is shown on its own.

- `figma-from-specs` writes a component back onto the canvas. A fill-width root placed directly on a page has nothing to resolve against
- `react-from-specs` and the Web Components transformer emit stories. A root at `width: 100%` fills whatever the story canvas happens to be
- A screenshot or visual-diff harness has the same problem before it can produce a stable image

Nothing in the spec says what that width should be, so each tool invents one. For a library authored at a mobile width, the results diverge from the design in ways that read as bugs:

- A card designed edge-to-edge at 375 renders 1200 wide
- Text that wraps to two lines in the library renders on one, and the vertical rhythm the component was designed around disappears
- Two tools reading the same spec produce different pictures of the same component, and neither is wrong by any rule the spec states

This affects **only** roots that fill horizontally. A root with a fixed width already states its width, and a root that hugs is sized by its content. Neither has anything to resolve, and neither is affected by anything decided here.

ADR-073 replaced `conventions.figma` with `conventions.platforms.<id>`, on the argument that Figma is one implementation among several and the pipeline runs in both directions. ADR-078 then gave each platform its own file in `config/conventions/`. That structure is what this fact needs, because the width is not necessarily one number: a Figma library authored at 375 can sit beside a React implementation whose story canvas standardises on 390, and neither is wrong.

So the question is not whether the spec should carry a width — it should not; a spec describes a component, not the surroundings it is shown in. The questions are which platform entry states it, exactly what the number is a width *of*, and what happens when nothing states it.

---

## Decision Drivers

- **The substitution rule (ADR-071).** A member is a convention when a different team, pointed at the same libraries, would **have to keep** it — where a wrong value produces incorrect output rather than merely different output
- **Platform dispersion is the test for where a member lives (ADR-077).** If the answer differs per platform, it belongs in that platform's entry
- **A generator reads one entry (ADR-073).** `conventions.platforms[myId]` is a single indexed read; a platform must never need another platform's entry to know its own width
- **Absence means one thing (ADR-071).** No declared width means the platform declares none. There is no separate on-switch
- **`PlatformConventions` is one permissive shape (ADR-073 Option 2A).** A new member must be meaningful for any platform that happens to declare it, not special-cased by key
- **Never override what the design states.** A component that declares its own width has already answered this question, and nothing here may contradict it
- **No logic in the schema package (Constitution II).** What a tool does in the absence of a declaration is the tool's behaviour, not the schema's
- **Type ↔ schema symmetry (Constitution I)** and **minimal public API (Constitution III)**
- **`Conventions` is unreleased.** `PlatformConventions` is introduced by ADR-073 in this same release. Adding a member to it now costs nothing

---

## Options Considered

Five decisions: whether the width is a convention, whose entry holds it, what the number is a width of, what happens without one, and its shape.

---

## Decision 1 — Is a default fill width a convention or a setting?

### Option 1A: A convention — the libraries state it *(Selected)*

Apply ADR-071's test. A different team generating React from the same Figma file, against the same component library, would have to keep `375` — show the mobile-first library's fill-width components at 1200 and the output is not a stylistic variation, it is a component in a layout it was never designed for, with different line counts and different heights.

**Pros**:

- Preserves the incorrect-versus-different discriminant. A wrong width produces a wrong picture; `format.output` produces a different file
- Preserves the sharing consequence, which is why `Conventions` exists: every consumer targeting the platform uses the same width, and drift between copies produces silently different pictures of the same component
- Preserves the meaning of absence. No declared width means the library states none — a statement nothing else can supply

**Cons / Trade-offs**:

- A width feels more tunable than a layer-name pattern, and someone will reasonably want to override it for one run. That is a legitimate per-run choice and belongs in `Settings`, not here — the convention is the default the override departs from. No such setting is defined today; see Consequences

---

### Option 1B: A setting — each run chooses it *(Rejected)*

**Rejected because**: it fails the discriminant and reproduces the drift ADR-071 ended. If the width is a per-run choice, every workspace, CI job, and plugin re-declares it, and the first one to forget shows the library wrong. The *override* for a particular render is a setting; the number it departs from is not.

---

### Option 1C: A property of the spec — `Component.defaultFillWidth` *(Rejected)*

**Rejected because**: a spec describes a component, not the surroundings it is shown in. The width is a fact about how a library is presented, shared by every fill-width component in it, and putting it on each component would repeat one value across the catalogue and invite per-component drift with no authority to resolve it. It would also freeze into published specs a number that belongs to whoever is rendering.

---

## Decision 2 — Whose entry holds it?

### Option 2A: A member of `PlatformConventions`, declared per platform *(Selected)*

Each platform's file states its own width.

```yaml
# config/conventions/figma.yaml
naming: SENTENCE
glyphs:
  match: "DS Icon Glyph / {i}"
defaultFillWidth: 375
```

```yaml
# config/conventions/react.yaml
stylesProp: sx
primitives:
  text:
    component: DsText
defaultFillWidth: 375
```

**Pros**:

- Passes ADR-077's dispersion test directly. The answer *can* differ per platform, and when it does, each platform can say so
- One indexed read (ADR-073). A React generator asks `platforms.react` for its width and never consults `platforms.figma`
- Meaningful for every platform, so it does not strain the permissive single shape `PlatformConventions` deliberately is. A platform that never shows anything declares nothing, exactly as a code platform declares no `states`
- Ownership lands where ADR-078 put it. The design lead sets the Figma value in the file they already own; the React team sets theirs. Neither appears in the other's diff
- Free. `PlatformConventions` is introduced by ADR-073 in this release

**Cons / Trade-offs**:

- The common case — every platform at the same width — repeats one number per file. Real, and the same trade ADR-073 Decision 3B already took: inheritance on the platform axis costs a merge rule, an override rule, and a depth question, for a saving of one line per platform
- Two platforms can disagree without anything objecting. That is the point when the disagreement is deliberate, and invisible when it is a typo. A consumer-side warning is possible; cross-entry validation is not a schema concern (Constitution II)

---

### Option 2B: A single width at the root of `Conventions`, beside `platforms` *(Rejected)*

**Rejected because**: it reintroduces the sibling asymmetry ADR-073 Decision 2B was rejected for, and asserts that every platform shows components at the same width with nowhere to say otherwise. With ADR-078 in force it also has no file to live in: `config/conventions/` holds one file per platform and nothing else.

---

### Option 2C: `platforms.figma` only, and other platforms read it *(Rejected)*

**Rejected because**: it makes a generator read another platform's entry, breaking the one-indexed-read property ADR-073 Decision 2A was selected for. It also privileges Figma in exactly the way ADR-073 removed: `figma-from-specs` renders to Figma as a target, so Figma's value is Figma's own choice, not a workspace-wide authority. And reading React to produce a spec never touches a Figma entry at all.

---

## Decision 3 — What is the number a width *of*?

The spec's `layoutSizingHorizontal` carries `FILL`, `FIXED`, or `HUG` on a root as on any element. Only one of the three has an open question.

### Option 3A: The width of a container the renderer places the instance in, applied only to fill-width roots *(Selected)*

When a root's `layoutSizingHorizontal` is `FILL`, the renderer places the instance inside a container of this width, and the instance fills it. The number is **the container's width, not the instance's** — the instance's width is whatever filling that container produces, which is what the design already said it should be.

When the root is `FIXED` or `HUG`, the member does not apply. No container is imposed, and the root is sized exactly as it states.

```yaml
# root: layoutSizingHorizontal FILL
#   → container at 375, instance fills it → instance is 375 wide
#
# root: layoutSizingHorizontal FIXED (320)
#   → member ignored, instance is 320 wide
#
# root: layoutSizingHorizontal HUG
#   → member ignored, instance is as wide as its content
```

**Pros**:

- **It cannot contradict the design.** The number is applied to something the renderer creates, never to something the spec declared. A fixed-width component keeps its width; a hugging component keeps hugging
- The scope matches the problem exactly. Only a filling root has an unanswered question, and only a filling root is affected
- It is the same mechanism the component already expects. In the library, a fill-width root sits inside a parent that has a width; the renderer supplies the parent that a standalone render lacks
- Uniform across the forms a component is shown in — a component on its own, an `instanceExample`, a `slotContentExample`, a story. Each is a top-level render, and each gets a container if and only if its root fills
- Nothing below the root is touched. Children are sized by their parents, as they already are

**Cons / Trade-offs**:

- A renderer must inspect the root's sizing before deciding whether to create a container, rather than applying one number unconditionally. Minor, and it is reading a value it already reads to lay out
- A renderer showing several components in one frame decides per component whether each is a root. That is its own composition question and the same one it already answers

---

### Option 3B: The instance's own width, for every root *(Rejected)*

**Rejected because**: it overrides the design. A root that declares `FIXED` at 320 would be forced to 375, and a hugging root would be stretched past its content — turning a default into a rewrite of what the spec states. It also makes the member a lie for two of three sizing modes.

---

### Option 3C: A canvas width every root sits in, whatever its sizing *(Rejected)*

Place every root on a canvas of this width, and let each resolve against it however its sizing says.

**Rejected because**: for `FIXED` and `HUG` roots it is a no-op dressed as a feature — the canvas changes nothing about the rendered component, so the member would claim a scope it does not have. Naming and documenting it as universal would then mislead every reader about when it matters, and the first person to debug a fixed-width component would look here first and find nothing.

---

## Decision 4 — What happens when no width is declared?

### Option 4A: The schema declares no default; each tool falls back to 375 *(Selected)*

The member is optional and absent by default. It does not appear in any defaults constant, and it stays optional after resolution. When a fill-width root is rendered and the platform declares nothing, the tool uses **375** — a number each tool holds, not one the schema resolves.

**Pros**:

- **It reaches the case a resolved default cannot.** ADR-073 removed the top-level defaults constant, and ADR-078 makes a platform's conventions a file that may not exist. A platform with no file has no entry for a default to be applied *into* — yet it still renders, and still needs a width. A tool-side fallback covers both cases with one number; a schema default covers only one and would need the tool-side number anyway
- Keeps absence meaning exactly what ADR-071 says it means. Nothing is fabricated into the resolved object that the library never declared, and `metadata.conventions` records only what was actually stated
- No logic in the schema package (Constitution II). What to do without a declaration is a rendering decision, and it belongs with the renderer
- One number, in the tools, applying to every platform. `figma-from-specs` already works this way

**Cons / Trade-offs**:

- The number lives in each tool rather than in one place, so tools can drift. Mitigated by this ADR naming 375 as the value, and by the member existing precisely so a library that cares declares it rather than relying on the fallback
- A consumer reading the resolved conventions still needs one null check. Cheap, and the honest shape

---

### Option 4B: `default: 375` in the schema, required on the resolved shape *(Rejected)*

**Rejected because**: it only reaches platforms that have an entry to resolve. Under ADR-078 a platform's conventions are a file, and a workspace with no `config/conventions/react.yaml` has no `platforms.react` for a default to land in — so every tool would still need its own 375 for that case, and the number would exist in two places with no mechanism keeping them equal. It also puts a value into the resolved object that the library never stated, which is what ADR-071 reserved absence to prevent.

---

### Option 4C: No fallback — a tool without a declared width errors *(Rejected)*

**Rejected because**: it makes an optional convention effectively required, and turns a workspace that has never thought about width into a broken one. The point of a default is that not declaring it is a valid, common state.

---

## Decision 5 — Shape

### Option 5A: A bare optional number, in pixels *(Selected)*

```yaml
defaultFillWidth: 375
```

**Pros**:

- One fact, one member. `stylesProp` set the precedent for a platform-level scalar in ADR-076, and this is the same shape
- No unit member. Pixels match every other dimension the schema carries (`Styles` sizing, `PositionOffset`), and a second way to express one number is a second thing for consumers to disagree about
- A block remains available additively if a second member of this kind arrives, and nothing decided here forecloses it

**Cons / Trade-offs**:

- A second render-time member would sit beside this one at the platform level rather than grouped with it. Cheap to revisit while `Conventions` is unreleased, and speculative to pre-empt now

---

### Option 5B: A `{ width, height }` pair *(Rejected)*

**Rejected because**: height is not the same problem. Once width is fixed, height follows from content in every layout the schema models, so a declared height either matches what the content produces — redundant — or contradicts it, leaving the renderer to decide which to believe. A vertically-filling root is a real but far rarer case, and pairing the two would force a height fallback to be invented alongside 375 when no comparable convention exists. **No height member is defined.**

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conventions.ts` | Added optional `defaultFillWidth?: number` to `PlatformConventions` (ADR-073) | MINOR |
| `Conventions.ts` | Same member on the resolved platform shape, optional there too — no default is applied at any level | MINOR |

**Example — new shape** (`types/Conventions.ts`):

```yaml
PlatformConventions:
  naming?: NONE | SENTENCE | TITLE
  glyphs?: {...}
  states?: {...}
  primitives?: {...}
  stylesProp?: string
  images?: {...}
  defaultFillWidth?: number   # optional — MINOR
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `conventions.schema.json` | Added property `defaultFillWidth` under the `PlatformConventions` definition | MINOR |

**Example — new shape** (`schema/conventions.schema.json`):

```yaml
# New property under #/definitions/PlatformConventions/properties
defaultFillWidth:
  type: number
  exclusiveMinimum: 0
  description: >-
    Width in pixels of the container this platform places a component in when the
    component's root resizes to fill its parent. Roots with a fixed or hugging
    width are unaffected. Absence means the platform declares no width and the
    rendering tool uses its own fallback.
  # not in required[], and no "default" — the fallback is the tool's, not the schema's
```

### Authoring surface (ADR-078)

The member is authored in the platform's own file, with no `platforms:` wrapper, per ADR-078 Decision 3A:

```yaml
# config/conventions/figma.yaml
defaultFillWidth: 375
```

### Notes

**Optional, with no default anywhere in the package.** There is no universal width — 375 is a choice, not a fact about libraries — so no default is applied at any level and the member stays optional after resolution. Absence keeps its ADR-071 meaning: the platform declares no width.

**375 is the tools' fallback, for every platform.** Each rendering tool uses 375 when its platform declares nothing. The number reflects how the libraries this ecosystem serves are currently authored rather than a principle, so changing it later is a tool change, not a schema change.

**Positive number.** `exclusiveMinimum: 0` rules out zero and negatives, which are not widths. No upper bound: the schema does not know what surroundings a consumer renders into.

**A default, not a constraint.** A consumer given an explicit width for a particular render uses that instead. The convention is what the override departs from (Decision 1A).

**Naming** (Constitution VI, rule 2). No code-platform consensus term exists — CSS says `width: 100%`, SwiftUI `.frame(maxWidth: .infinity)`, flexbox `flex: 1` — so the name follows a single code platform: Jetpack Compose's `Modifier.fillMaxWidth()`, which uses `fill` for precisely this concept. It also matches the `FILL` value the spec's own `layoutSizingHorizontal` carries, so the member names the exact condition it applies to. `fill` as a verb taking a dimension does not collide with `fills` as Figma's paint array; no abbreviations.

**Interaction with ADR-079.** `metadata.conventions` records only the platform entry that produced the spec, so a spec generated from Figma carries Figma's width and no other, and carries nothing when Figma declared nothing. A React generator does not read that entry for its own rendering — it reads `platforms.react` in its own workspace, per Decision 2C's rejection.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `PlatformConventions['defaultFillWidth']` in `types/Conventions.ts` maps to `#/definitions/PlatformConventions/properties/defaultFillWidth` in `schema/conventions.schema.json`. The resolved shape carries the same optional member and, like every other member of the resolved conventions, has no separate schema definition — only the authored shape is validated. No other type or schema definition changes.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Loads `config/conventions/<platform>.yaml` (ADR-078) and generates stories and other shown output | Accept and pass through the member; include it in the per-platform templates; for a fill-width root, size the story's containing element from the invoked platform's value, falling back to 375 |
| `specs-from-figma` | Renders specs onto the Figma canvas | Recompile; for a fill-width root, create the containing frame at `platforms.figma.defaultFillWidth`, keeping the existing hardcoded 375 as the absent-case fallback. Leave fixed and hugging roots untouched |
| `specs-plugin-2` | Renders components and examples on the canvas | Recompile; read the same Figma entry, same 375 fallback, same fill-only condition |

Consumers MUST read **their own** platform entry, MUST apply the width only when the root's `layoutSizingHorizontal` is `FILL`, MUST apply it to the container they create rather than to the instance, and MUST fall back to 375 rather than to another platform's value when their entry declares none.

---

## Semver Decision

**Version**: `0.32.0` (release branch `release/schema-0.32.0+cli-0.29.0`) — **MINOR**.

**Justification**: The change adds one optional member to `PlatformConventions`, a type introduced by ADR-073 in this same unreleased version, and one optional property to its schema object. No field is renamed, removed, or changed in presence — additive per the constitution's versioning rule ("`MINOR` for additive types or new optional fields").

---

## Consequences

- A component whose root fills its parent can be shown standalone at the width it was designed for, and every consumer targeting that platform uses the same number. Two tools rendering one spec for one platform produce the same picture
- A mobile-first library is expressible. `defaultFillWidth: 375` is the difference between a card that renders as designed and one that stretches across a desktop canvas
- Fixed-width and hugging components are explicitly out of scope, and no renderer may impose a width on them. The member cannot be used to override what a design states
- Figma and code platforms can legitimately differ — a Figma container at 375 beside a story canvas at 390 — and the structure says so rather than forcing one to be wrong
- The rule is uniform across the forms a component is shown in. A component render, an `instanceExample`, a `slotContentExample`, and a story are all top-level renders and all get a container when their root fills
- 375 stays in the tools. A workspace that has never considered width keeps working, and the number is changeable without a schema release
- Every platform at the same width repeats the number once per file. Accepted under ADR-073 Decision 3B: no inheritance on the platform axis
- **A per-run width override is not defined.** Decision 1A places it in `Settings`, but no such member exists, so today a run that wants a different width edits the convention. Worth a follow-up ADR if the need is real; nothing here forecloses it
