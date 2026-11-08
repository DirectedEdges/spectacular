# ADR: A Library's Images Are Assets It Lays Out, Named by a Pattern

**Branch**: `117-library-image-assets`
**Created**: 2026-11-08
**Status**: DRAFT
**Summary**: `images.match` becomes a naming pattern over laid-out image assets, and `images.component` alone names the designated image component.
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — amends ADR-077's `images` vocabulary)*

---

## Context

A library curates images the way it curates icons: a page of them, laid out in a grid, named for what they are. Icons already have a convention for that — `glyphs.match` names the pattern their components follow, and a fetch extracts every match as an asset. Images have no equivalent.

What images *do* have is two narrower paths, both already built:

- **Fill styles.** An image painted onto a published `FILL` style is reachable, and the baseline this ADR assumes already fetches those into `assets/images/` and records them in a lookup keyed by image hash, carrying the style's `name`, the components that use it, and an `origin` saying where in Figma it lives.
- **Component fills.** An image placed on a component is captured when that component is generated.

Neither reaches an image a designer laid out on a page *as an image* — bound to no style and used by no component. That is precisely the curated set a library wants to publish, and today nothing can see it.

### The vocabulary problem this exposes

Adding a naming pattern to the `images` convention collides with the property that would most naturally hold it. `images.match` is already taken, and it does not mean a pattern:

```yaml
# config/conventions/figma.yaml — today
images:
  match: DS Image          # a literal component name, not a pattern
  sourceProps: [source]
```

Across the conventions contract, `match` otherwise means *a naming pattern*:

| Property | Meaning of `match` |
|---|---|
| `glyphs.match` | naming pattern over a component name, `{i}` capturing the icon name |
| `subcomponents.match` | naming patterns, `{C}` and `{S}` placeholders |
| `instanceExamples.match` | naming patterns, `{C}` placeholder |
| `slots.default.match` | naming patterns identifying the default slot |
| `PrimitiveEntry.match` | layer-name prefixes selecting an entry |
| **`images.match`** | **a literal component name** |
| **`codeOnlyProps.match`** | **a literal layer name** |

Five of seven are patterns. Two are literal names, and `images.match` is one of them. Introducing a genuine pattern anywhere else in the `images` block would leave the one `match` that is not a pattern sitting beside one that is — the inconsistency becomes legible at exactly the moment it starts to mislead.

`codeOnlyProps.match` is the other literal-name case. It is **out of scope** here: nothing in this change touches it, and renaming it has its own consumers and its own argument to make.

### `images.component` is declared and unread

ADR-077 gave the `images` block two vocabulary members for the same component:

| Property | Declared meaning |
|---|---|
| `images.match` | the Figma name of the designated image component (`"DS Image"`) |
| `images.component` | the same component's name on this platform (`"DsImage"`) — the translation target for a `match` declared by whichever platform produced the spec |

Conventions are declared per platform, in one file per platform. So `figma.images.match` and `react.images.component` are not two concepts — they are one slot, named differently depending on which direction the declaring platform faces. Each platform only ever needs to say what *it* calls the component.

No consumer reads `images.component`. It is declared in `types/` and `schema/` and nothing resolves it, which is consistent with it never having been needed as a separate key.

That makes the apparent collision an argument for collapse rather than for a third name.

---

## Decision Drivers

- **Naming governance (constitution VI)**: Figma is the data source, not the naming authority. A convention member describing how a Figma library is authored falls to rule 3 — Figma's model is deferred to only where no code platform has an opinion and deviating would cost data faithfulness. No code platform has a term for "a frame on a page that is an image asset", so the vocabulary is ours to choose for consistency with the rest of the contract.
- **One word, one meaning**: a reader who has learned `match` from `glyphs` must not have to relearn it in `images`. Vocabulary consistency across the conventions contract is what makes the contract learnable at all.
- **Type ↔ schema parity (constitution I)**: every type change carries its schema counterpart, both directions.
- **No logic in the schema package (constitution II)**: this ADR declares vocabulary and shape. How a frame is located in a payload belongs to consumers.
- **Absence is a statement**: a convention block absent means the library has no such convention, and no detection is performed. A declaration must never be inferred — a wrong guess at an image convention fabricates assets, where absence merely finds none.
- **Breaking changes are owned, not avoided**: the constitution prices a field rename as MAJOR. The question is whether the rename earns it, not whether it can be dodged.
- **Round-trip plausibility**: the same declaration that says how to *find* a grid of images should be sufficient to say how to *write* one, so the reverse direction is not designed into a corner.

---

## Options Considered — Decision 1: How an image asset is detected

### Option A: A naming pattern over frames, position-constrained to a page or its sections *(Selected)*

A frame qualifies when its name matches the declared pattern **and** it sits either as a direct child of a page, or as a direct child of a section that is itself a direct child of a page.

```yaml
images:
  match: 'Image / {i}'
```

**Pros**:
- Mirrors `glyphs` exactly: one pattern carries both membership and the captured name, so a reader who knows the icon convention already knows this one.
- The position rule is what makes a *grid* distinguishable from an image used incidentally deeper in the file. A library lays its asset page out as top-level frames, optionally grouped into sections.
- Sections are how Figma pages are grouped, so allowing one section level supports a page organised by category without opening the whole subtree.
- Bounded traversal: two levels, never a full page walk.

**Cons / Trade-offs**:
- A library nesting its grid two sections deep is not detected, and the failure is silent — the images simply are not found.
- Position is fixed by the contract rather than declared, so a library with a different layout cannot opt into it.

---

### Option B: A naming pattern over frames at any depth *(Rejected)*

Any frame anywhere in the file whose name matches the pattern is an image asset.

**Rejected because**: it fabricates assets. A frame named for the pattern inside a component — a placeholder, an example, a spec annotation — would be extracted as a curated library image. That violates the driver that absence and presence must both be truthful: a convention that over-matches is worse than one that under-matches, because the result looks like a complete set and is not.

---

### Option C: A designated page, everything on it an image *(Rejected)*

```yaml
images:
  page: 'Images'
```

**Rejected because**: it carries no name for the image. Every other asset convention captures the asset's name from the pattern, and a page-only declaration would have to fall back to the raw frame name with no way to strip a prefix — leaving the captured name at the mercy of layout labels. It also cannot express a library that keeps images on more than one page, where a pattern can.

---

### Option D: A structural form, as `glyphs.structure` offers *(Rejected for now)*

Membership by child structure rather than by name — a frame whose single child is an image fill.

**Rejected because**: the structural form exists in `glyphs` for libraries whose glyph components are plainly named and cannot be matched. The equivalent problem has not been observed for images, and the constitution's minimal-API driver says a second membership form needs a library that needs it. This stays available as a later addition without breaking the pattern form.

---

## Options Considered — Decision 2: Which property names the pattern

### Option A: `images.match` becomes the pattern; the designated component collapses into `images.component` *(Selected)*

```yaml
# Before
images:
  match: DS Image
  sourceProps: [source]

# After
images:
  match: 'Image / {i}'     # naming pattern — consistent with glyphs.match
  component: DS Image      # what this platform calls the designated image component
  sourceProps: [source]
```

**Pros**:
- `match` means a naming pattern everywhere in the contract, with no exception left inside `images`.
- It is a collapse, not a third name: `images.component` already means "this platform's name for the designated image component", and a per-platform convention file only ever needs one such key. The two keys were one slot.
- Nothing reads `images.component` today, so the consuming side gains a meaning rather than changing one.
- The property each platform declares is now the same key in every platform file, which is what every other per-platform vocabulary member already does.

**Cons / Trade-offs**:
- MAJOR: every library declaring `images.match` as a component name must rename it to `images.component`.
- It partially reverses an earlier rename. The pre-split configuration called this `imageComponent`, and migration moved it to `match`; this moves it again. A library that has migrated once will migrate again.
- `images.component` loses its stated cross-platform-translation framing and becomes a plain per-platform name. That is a simplification, but it is a change of meaning to a declared member, not only a move.

---

### Option B: `images.match` keeps the component; the pattern gets a new property *(Rejected)*

For example `images.assets`, `images.grid`, or `images.page`.

**Rejected because**: it is the cheapest option and the one that entrenches the problem. The `images` block would then hold a pattern property *and* a `match` that is not a pattern, side by side — the exact adjacency that makes the inconsistency misleading rather than merely untidy. Avoiding a MAJOR by making the contract less learnable trades a one-time migration for a permanent cost, which the "one word, one meaning" driver rejects.

---

### Option C: The pattern takes `images.match`; the component takes a third name *(Rejected)*

For example `images.sourceComponent`, pairing with `sourceProps`, or a return to `images.imageComponent`.

**Rejected because**: it leaves `images.component` declared, unread, and now unexplainable — a member whose stated purpose ("the same component's name on this platform") is served by a different key. Two keys for one slot is the defect, and a third name preserves it. `images.imageComponent` additionally stutters inside the block that already says `images`, and the no-abbreviation standard offers no relief there.

---

## Options Considered — Decision 3: The capture placeholder

### Option A: `{i}`, the existing placeholder *(Selected)*

```yaml
images:
  match: 'Image / {i}'
```

`i` is the initial of *image* as readily as of *icon*, so the existing placeholder covers this case without being redefined.

**Pros**:
- Adds nothing to the vocabulary an author has to learn. A library already declaring `glyphs.match: 'Icon / {i}'` writes `images.match: 'Image / {i}'` with no new rule.
- The placeholders are initials of what they capture — `{C}` component, `{S}` subcomponent, `{i}` icon *or* image — and `i` serves both subjects honestly rather than by stretching.
- The block disambiguates. `{i}` inside `glyphs.match` captures an icon name; inside `images.match` it captures an image name. No declaration is ever ambiguous about which, because the property it sits in says so.
- One placeholder for "the asset's own name" generalises if a third asset kind ever wants the same treatment.

**Cons / Trade-offs**:
- The published glyphs documentation calls `{i}` the icon-name placeholder, so that description has to widen to name both subjects.

---

### Option B: `{n}`, for the captured name *(Rejected)*

**Rejected because**: it buys disambiguation nobody needs — the enclosing property already says which asset is being named — at the cost of a fourth placeholder in a vocabulary whose whole value is being small. It also names the *capture* where every other placeholder names the *subject*, so it would be the one placeholder following a different rule.

---

### Option C: `{m}` for image *(Rejected)*

**Rejected because**: `m` is not the initial of anything in play, and the obvious reading is "match" — the property it sits inside — rather than the captured name.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conventions.ts` | `PlatformConventions.images.match` — meaning changes from a literal component name to a naming pattern | MAJOR |
| `Conventions.ts` | `PlatformConventions.images.component` — meaning narrows from "the translation target for another platform's `match`" to "what this platform calls the designated image component" | MAJOR |
| `Conventions.ts` | `ResolvedPlatformConventions.images` — same two members, mirrored | MAJOR |

**Example — new shape** (`types/Conventions.ts`):
```yaml
# Before
images:
  backgroundImage?: boolean
  match?: string          # Figma name of the designated image component
  component?: string      # the same component's name on this platform
  sourceProps?: string[]

# After
images:
  backgroundImage?: boolean
  match?: string          # naming pattern over image asset frames, {i} capturing the name
  component?: string      # what this platform calls the designated image component
  sourceProps?: string[]
```

No member is added or removed. Both changes are to what a declared member *means*, which the constitution prices as breaking because every existing declaration becomes wrong.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `conventions.schema.json` | `#/definitions/PlatformConventions/properties/images/properties/match` — description replaced; now a naming pattern | MAJOR |
| `conventions.schema.json` | `.../images/properties/component` — description replaced; now this platform's name for the designated component | MAJOR |
| `conventions.schema.json` | `.../images` — block description updated to describe both members' new meanings | MAJOR |

**Example — new shape** (`schema/conventions.schema.json`):
```yaml
# #/definitions/PlatformConventions/properties/images/properties
match:
  type: string
  description: "Naming pattern identifying image asset frames laid out on a library page, using the {i} placeholder to capture the image name."
  examples: ['Image / {i}']
component:
  type: string
  description: "What this platform calls the designated image component. Requires a non-empty sourceProps."
```

The `images` block declares `additionalProperties: false`, so no declaration can carry both the old and new readings of a key — a library that has not migrated fails validation rather than being half-read.

### Notes

- Both members stay optional. A library with a page of images and no designated component declares `match` alone; one with a component and no asset page declares `component` alone; absence of the whole block still means no image convention.
- The `requires a non-empty sourceProps` constraint follows `component`, since it was always a fact about the designated component rather than about the key's name.
- The position rule from Decision 1 — a direct page child, or a direct child of a section that is a direct page child — is a fact about what the pattern is matched against. It is stated in the `match` description and belongs to consumers to enforce; this package declares no traversal.
- Writing a grid of images back to Figma is the reverse of this detection and is **out of scope**. The declaration is deliberately sufficient for it — a pattern that can locate frames can name them — but no reverse behaviour is decided here.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `PlatformConventions.images.match` ↔ `#/definitions/PlatformConventions/properties/images/properties/match`; `PlatformConventions.images.component` ↔ the sibling `component` property. `ResolvedPlatformConventions.images` carries the same two members in resolved form and is updated alongside. No definition is added, so no new type obligation arises under principle I.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Update usage | Validates the `images` block and reports a bad declaration; the message for the designated component moves to `component`, and `match` gains pattern validation. Its image fetch acquires a second source — the asset page — alongside the fill styles it already reads |
| `specs-from-figma` | Update usage | Reads the designated image component from `component` rather than `match`, and reads `match` as a pattern over asset frames |
| `figma-from-specs` | None | No read of this block today. The reverse direction is named as out of scope above |
| `react-from-specs` | Recompile | No read of either member today |
| `webcomponents-from-specs` | Recompile | No read of either member today |
| `from-specs` | Recompile | Shared core; no read of either member today |
| `specs-plugin-2` | Recompile | Reads the `images` block only through `specs-from-figma`, never directly, so it inherits that package's adoption rather than making its own |

A configuration migration path already exists for this block and will need the new mapping: the pre-split `processing.images.imageComponent` currently converts to `match` and must convert to `component` instead.

The documentation surface is also incomplete today — the published `images` settings page describes `backgroundImage`, `match` and `sourceProps` and omits `component` entirely. Correcting it is part of adopting this ADR, not a separate concern, since the page would otherwise document a member whose meaning just changed and stay silent on the one that received it.

---

## Semver Decision

**Target version**: `0.40.0` — the version of `@directededges/specs-schema` on the active `release/next` branch.

**Change class**: `MAJOR` — for CHANGELOG placement, not a version bump.

**Justification**: The constitution prices `MAJOR` for "any breaking change to a type signature, field name, field presence, or schema structure", and principle III makes renaming a named field within a type a breaking change. No field is added or removed here, but both affected members change meaning: every existing `images.match` declaration becomes a wrong declaration, and `additionalProperties: false` means it cannot be silently tolerated. A change that invalidates every existing declaration of a member is breaking regardless of whether the key's spelling moved.

---

## Consequences

- A library can publish a curated set of images by laying them out on a page and naming them to a pattern, the same way it already publishes icons — and the set is reachable without any component using it and without any fill style carrying it.
- The image lookup gains a third `origin` value, `pageFrame`, beside `style` and `component` — named for the node that carries the image rather than for the page it sits on. An image can carry more than one origin, so a frame that is also a fill style's paint is one entry stating both.
- `match` means a naming pattern everywhere in the conventions contract except `codeOnlyProps.match`, which is named here as the remaining exception and left for its own decision.
- Each platform declares what it calls the designated image component under one key, in its own file, as every other per-platform vocabulary member already works.
- Every library declaring `images.match` as a component name must move it to `images.component`. There is no overlap period: the block admits no additional properties, so an unmigrated declaration fails validation and says so.
- A library that has already migrated from the pre-split `imageComponent` migrates a second time. That cost is accepted rather than dismissed; the alternative was a permanent vocabulary exception.
- The detection rule is bounded to a page and one level of sections. A library organising its asset page more deeply is not detected, and nothing reports the absence — a known limitation of the position rule, and the reason Decision 1's structural form is left available.
- The published `images` settings page becomes accurate for the first time, documenting all four members of the block.
