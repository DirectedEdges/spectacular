# ADR: Rename `clipContent` to `clipsContent`

**Branch**: `069-clips-content`
**Created**: 2026-08-14
**Status**: ACCEPTED
**Summary**: A `clipsContent` boolean style replaces `clipContent`, joining `visible` and `locked` as element state consumers map to `overflow`.
**Decides**: styles.clipsContent
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

`Styles` declares a boolean style named `clipContent`:

```yaml
# types/Styles.ts — current
Styles:
  clipContent: Style
```

The name matches nothing. The property describes whether an element cuts off content that overflows its box, and the key the data actually carries is `clipsContent`. Because the declared key and the carried key differ by one character, every consumer of the declared key has been inert since it shipped:

- The `styles.schema.json` property `clipContent` never validates against emitted spec output.
- The `StyleKey` union member `'clipContent'` never selects a real style.
- The CSS mapping rule for `clipContent → overflow` never fires, so `overflow: hidden` / `overflow: visible` is never emitted.

The defect is a typo. But correcting a typo still means publishing a field name, and a published field name is a contract with every consumer — so this ADR treats both halves as open questions rather than assuming the answer:

1. **The construct** — is an on/off boolean the right way to model clipping at all, or should this be an enum?
2. **The name** — given the construct, what should the field be called?

The risk to guard against is that `clipsContent` happens to be Figma's spelling. Constitution VI is explicit that Figma is the data source, not the naming authority. Arriving at Figma's spelling is acceptable; arriving at it *because* it is Figma's spelling is not. Each decision below is therefore settled on code-platform evidence and on terms the schema already uses, and each records what would have changed the answer.

---

## Cross-platform survey

Both decisions draw on the same evidence, gathered once here.

| Platform | API | Construct | Name shape |
|----------|-----|-----------|------------|
| UIKit | `UIView.clipsToBounds: Bool` | Boolean | third-person verb + boundary |
| SwiftUI | `.clipped()`, `.clipShape(_:)` | Modifier presence (on/off) | past participle |
| Android View | `ViewGroup.clipChildren`, `View.clipToOutline` | Boolean | verb + object / verb + boundary |
| Jetpack Compose | `Modifier.clip(shape)`, `Modifier.clipToBounds()` | Modifier presence (on/off) | verb + boundary |
| CSS | `overflow: visible \| hidden \| clip \| scroll \| auto` | Enum | overflow noun |
| React Native | `overflow: 'visible' \| 'hidden' \| 'scroll'` | Enum (CSS subset) | overflow noun |
| Flutter | `clipBehavior: Clip` (`none`, `hardEdge`, `antiAlias`, `antiAliasWithSaveLayer`) | Enum | verb + behavior noun |
| Figma | `clipsContent: boolean` | Boolean | third-person verb + object |

---

## Decision Drivers

- **Construct neutrality**: the shape must be the one code platforms agree on, and must not carry values this schema has no way to populate.
- **Name neutrality**: every naming tiebreak must resolve on code-platform evidence or on vocabulary the schema already uses — never on "Figma spells it this way".
- **Falsifiability**: each decision states what evidence would have produced a different answer, so a reviewer can check the reasoning rather than trust it.
- **Type ↔ schema symmetry**: the type, the schema property, and the `StyleKey` union must move together (Constitution IV).
- **Breaking-change discipline**: renaming a named field within an exported type is breaking and MUST be versioned accordingly (Constitution III).

---

## Decision 1 — Construct: boolean or enum?

### Option A: Keep the boolean (`Style` / `BooleanStyleValue`) *(Selected)*

Model clipping as an on/off style, unchanged from today.

**Pros**:
- **Constitution VI rule 1 applies — 2+ code platforms agree, independent of Figma.** Four of the seven code platforms surveyed model clipping as on/off: UIKit and Android View as literal booleans, SwiftUI and Compose as modifier presence. Figma's agreement is a fifth data point, not the basis.
- **The three enums degenerate to a boolean in this domain.** Their extra values fall into two buckets, neither of which this schema can express:
  - *Scrolling* — CSS/React Native `scroll` and `auto` describe a scrolling affordance, a runtime interaction behavior. The schema has no scroll concept anywhere in `Styles`, and a static design surface produces no scroll state to extract.
  - *Rasterization quality* — Flutter's `hardEdge` / `antiAlias` / `antiAliasWithSaveLayer` describe how the clip is rendered, a render-time performance trade-off with no design-surface counterpart.

  Remove what the schema cannot populate and CSS `overflow` collapses to `visible` vs `hidden`, and Flutter's `Clip` collapses to `none` vs everything-else. Both are booleans wearing an enum's clothes.
- **Widening at the consumer boundary is lossless; narrowing is not.** A boolean projects cleanly onto every enum — the existing CSS mapping already does exactly this (`true → overflow: hidden`, `false → overflow: visible`). An enum in the schema would instead force platforms with a boolean to narrow, and would advertise values no extractor can ever produce.
- Reuses the existing `BooleanStyleValue` schema definition, so the value stays token-bindable like other boolean styles (`visible`, `locked`, `wrap`).

**Cons / Trade-offs**:
- If the schema ever models scrolling containers, clipping and scrollability will need to be reconciled — a boolean cannot express `overflow: scroll`. That is a genuine future cost, but it is a *new capability* deserving its own ADR, not a reason to pre-build an enum whose extra values would sit permanently unpopulated.

**What would have changed this**: if a majority of code platforms modeled clipping with a value set that survives the design-surface filter — three or more distinct, extractable clipping modes rather than on/off — the enum would win.

---

### Option B: CSS-shaped `overflow` enum *(Rejected)*

Replace the boolean with `overflow: 'VISIBLE' | 'HIDDEN' | 'CLIP'`.

**Rejected because**: it violates the construct-neutrality driver from the opposite direction — it adopts the *web's* model as the neutral one. CSS and React Native are one platform family, not two independent votes, so this is closer to a single-platform preference than the rule-1 consensus Option A has. It also imports `scroll`/`auto` semantics the schema cannot populate, and collides with the existing `textOverflow` style (`CLIP` | `ELLIPSIS`) — two unrelated `overflow`-named properties with a shared `CLIP` value that means different things.

---

### Option C: Flutter-shaped `clipBehavior` enum *(Rejected)*

Adopt a named enum modeled on Flutter's `Clip`.

**Rejected because**: its distinctions are rasterization quality, which is a rendering implementation concern rather than a design decision, and nothing on a design surface determines which value to emit. It is a single-platform model with no second platform agreeing.

---

## Decision 2 — Name: what should the boolean be called?

Given a boolean, the survey offers three naming shapes. Two axes are in play — what the name points at (the clipped object vs. the clipping boundary), and the verb form.

### Option A: `clipsContent` *(Selected)*

**Pros**:
- **Object-naming beats boundary-naming on schema-internal grounds.** The platforms split evenly on this axis — Android `clipChildren` and Figma `clipsContent` name the clipped object; UIKit `clipsToBounds` and Compose `clipToBounds` name the boundary. The tiebreak is not Figma's vote, it is that **`Styles` has no `bounds` concept to point at.** The schema models extent as `width`/`height`/`min*`/`max*` with no bounds object, so a `*ToBounds` name would reference a term the schema never defines. `content` is already the schema's word for what an element contains.
- **`content` generalizes where `children` does not.** Android's `clipChildren` names child views specifically, but clipping applies equally to overflowing text and paint on elements with no children. `content` covers all three; `children` would be wrong for a clipped `TEXT` element.
- **The verb form is settled by internal consistency, not by Figma.** Booleans in `Styles` read as state predicates describing the element — `visible`, `locked`, `wrap` — not as commands. `clipsContent` reads as a predicate ("this element clips content"); the current `clipContent` reads as an imperative instruction, which is why it looks out of place beside its neighbors. UIKit's `clipsToBounds` independently confirms the third-person form for a boolean clip flag.

**Cons / Trade-offs**:
- The result is spelled the same as Figma's property. Every tiebreak above was decided on code-platform or in-schema evidence, and the coincidence is what it is — but the reasoning, not the match, is what should be reviewed.

**What would have changed this**: if `Styles` modeled a bounds or frame object, `clipsToBounds` would carry two code platforms (UIKit, Compose) plus an in-schema referent and would win. It does not, so it cannot.

---

### Option B: `clipsToBounds` *(Rejected)*

**Rejected because**: it names a referent the schema does not define. `Styles` has no bounds object, so the name would point at a concept a consumer cannot look up — trading a Figma-shaped name for a UIKit-shaped one without improving neutrality.

---

### Option C: Keep `clipContent`, translate in the transformer *(Rejected)*

Leave the schema name alone and rename `clipsContent` → `clipContent` on the way out.

**Rejected because**: Constitution VI's rationale for making the transformer translate is to spare consumers a *deliberate* naming decision. This name was not decided, it was mistyped. Paying a permanent translation step to preserve a typo inverts the rule. It also keeps the imperative verb form that reads wrong beside `visible` and `locked`.

---

## Decision

Model clipping as a boolean, and rename the field, the schema property, and the `StyleKey` member to `clipsContent`.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Styles.ts` | Renamed field `clipContent` → `clipsContent` on `Styles` | MAJOR |
| `Styles.ts` | Renamed `StyleKey` union member `'clipContent'` → `'clipsContent'` | MAJOR |

**Example — new shape** (`types/Styles.ts`):
```yaml
# Before
Styles:
  effects: TokenReference | Effects
  clipContent: Style
  cornerRadius: Style | Corners

# After
Styles:
  effects: TokenReference | Effects
  clipsContent: Style
  cornerRadius: Style | Corners
```

```yaml
# StyleKey — before
StyleKey:
  - effects
  - clipContent
  - cornerRadius

# StyleKey — after
StyleKey:
  - effects
  - clipsContent
  - cornerRadius
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `styles.schema.json` | Renamed property `clipContent` → `clipsContent` | MAJOR |

**Example — new shape** (`schema/styles.schema.json`):
```yaml
# Before — under #/definitions/Styles/properties
clipContent:
  $ref: "#/definitions/BooleanStyleValue"
  description: "Clip content"

# After
clipsContent:
  $ref: "#/definitions/BooleanStyleValue"
  description: "Whether the element clips content that overflows its box"
```

### Notes

- The construct is unchanged: the type stays `Style`, the schema `$ref` stays `BooleanStyleValue`, and the property stays optional. Only the key changes. Decision 1 records that the boolean was re-examined and re-affirmed rather than inherited by default.
- No deprecation alias is introduced. An alias would keep alive a name that has never resolved to a value, and would require consumers to handle two keys for one concept.
- The description is rewritten from `"Clip content"` — an imperative fragment restating the old field name — to a statement of what the boolean means.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `Styles.clipsContent` ↔ `#/definitions/Styles/properties/clipsContent`; the `StyleKey` union member `'clipsContent'` names the same key. All three rename in one change; no drift is introduced.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | The CSS mapping keyed on the old name stops being dead code once the key matches | Update the key used by the style-to-CSS mapping and its mapping documentation; recompile |
| `specs-from-figma` | Emitted output already uses `clipsContent`; it now validates against the schema | Recompile against the new types; confirm no code references the old key |
| `specs-plugin-2` | Consumes the same style key surface | Recompile; update any reference to the old key |
| Docs site | A styles reference page is published under the old name | Rename the page and update references to the new key |

---

## Semver Decision

**Target version**: `0.30.0` — the version of the active release branch (`release/schema-0.30.0+cli-0.27.0`). This ADR ships within that release and proposes no bump of its own.

**Change class**: `MAJOR`-class (breaking). Renaming a named field within an exported type and renaming a schema property are both breaking changes under Constitution III and the Versioning rule ("`MAJOR` for any breaking change to a type signature, field name, field presence, or schema structure"). It MUST be called out as breaking in `CHANGELOG.md` under the release's entry.

**Naming governance citation**: Constitution VI **rule 1** — 2+ code platforms agree. For the construct, UIKit, Android View, SwiftUI, and Compose agree on on/off. For the object-vs-boundary naming axis the code platforms tie, and the tiebreak is drawn from the schema's own vocabulary rather than from Figma. Rule 3 (defer to Figma) is **not** invoked anywhere in this ADR.

---

## Consequences

- `clipsContent` resolves against real data for the first time, so the style appears in spec output and the schema validates it.
- Consumers that map this style — including the CSS `overflow` mapping — begin producing output where they previously produced nothing.
- The boolean construct is now on the record as examined and justified, so a future proposal to widen it to an enum has a documented bar to clear: it must name extractable clipping modes beyond on/off.
- Scrolling remains unrepresentable in `Styles`. If the schema ever gains scroll semantics, the relationship between clipping and scrollability needs its own ADR.
- The name `clipContent` is gone with no alias; any consumer referencing it fails at compile time rather than silently matching nothing.
- Published spec documents produced before this change carry no `clipContent` key to migrate, since the key was never emitted.
