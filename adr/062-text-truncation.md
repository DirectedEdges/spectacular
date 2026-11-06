# ADR: Text overflow style keys (`textOverflow`, `maxLines`)

**Branch**: `062-text-truncation`
**Created**: 2026-07-09
**Status**: ACCEPTED
**Summary**: `textOverflow` and `maxLines` properties add truncation to styles already covering typography and layout.
**Decides**: styles.maxLines, styles.textOverflow
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

A text node in Figma can be configured to truncate its content with an ellipsis when the content exceeds the node's bounds. Two Figma properties govern this — `textTruncation` (`'DISABLED' | 'ENDING'`) and `maxLines` (`number | null`, only meaningful when truncation is on). Neither is currently represented in the schema: `Styles` in `types/Styles.ts` and the `Styles` definition in `schema/styles.schema.json` have no key for either, and `StyleKey` does not enumerate them. Truncation configuration is therefore silently dropped from spec output — a fidelity gap for line-clamped labels, single-line truncating text, and any component whose text-overflow behaviour is part of its design contract.

Both properties belong to the `TEXT` element type only. They are available in **both** runtimes: the Plugin API exposes them as top-level `TextNode` properties, and the REST API nests them under the node's `style` object (`TypeStyle.textTruncation`, `TypeStyle.maxLines`).

### Naming — how each platform models this

The schema names identifiers by code-platform vocabulary, not Figma's (Constitution VI). Comparing the three target platforms:

**Truncation / overflow handling**

| Platform | Property | Values |
|----------|----------|--------|
| Web (CSS) | `text-overflow` | `clip` \| `ellipsis` (+ `<string>`) |
| Android (Compose) | `overflow: TextOverflow` | `Clip` \| `Ellipsis` \| `Visible` \| `StartEllipsis` \| `MiddleEllipsis` |
| iOS (SwiftUI) | `truncationMode` | `.head` \| `.middle` \| `.tail` |
| Figma | `textTruncation` | `DISABLED` \| `ENDING` |

**Maximum line count**

| Platform | Property |
|----------|----------|
| Android (Compose) | `maxLines: Int` |
| iOS (SwiftUI) | `lineLimit(Int?)` |
| Web (CSS) | `line-clamp: <n>` |
| Figma | `maxLines` |

Reading these against the constitution's naming rules:

- **Property name → `textOverflow`.** The term "overflow" is shared by **two** code platforms (CSS `text-overflow`, Compose `TextOverflow`); "truncation" by only one (SwiftUI `truncationMode`) plus Figma. Constitution VI rule 1 (favor a term 2+ code platforms share) selects **overflow**. The `text` prefix disambiguates from container overflow (already modelled by `clipContent`).
- **Values → `'CLIP' | 'ELLIPSIS'`.** CSS (`clip`/`ellipsis`) and Compose (`Clip`/`Ellipsis`) agree on these value names too — again 2 code platforms (rule 1). SCREAMING_CASE per the Styles enum-casing rule. The set extends cleanly to Compose's `VISIBLE` / `START_ELLIPSIS` / `MIDDLE_ELLIPSIS` if ever needed. No platform models this as a boolean — all use an enum — so a boolean is rejected as a dead-end that cannot express clip-vs-visible or truncation position.
- **`maxLines` kept.** Android/Compose uses exactly `maxLines`; it is unabbreviated and unambiguous under a `TEXT` element. No platform uses `maxTextLines`; SwiftUI's `lineLimit` is the only alternative and is less transparent. `maxLines` is a plain number, so it is typed as `Style` like every other numeric key (`width`, `opacity`, `cornerSmoothing`) — not a named type.

Figma's `textTruncation` values (`DISABLED`/`ENDING`) are remapped to the platform vocabulary by the transformer (`DISABLED → CLIP`, `ENDING → ELLIPSIS`), the same way `mainAxisAlignment` remaps Figma's `MIN`/`MAX`.

---

## Decision Drivers

- **Additive-only** — new optional keys, no change to any existing type or schema (MINOR bump).
- **Type ↔ schema parity** — every new `types/` field has a matching `schema/` definition; no drift (Constitution I).
- **Structural-enum typing rule** — a closed, non-token-bindable value set MUST be a named type, not `Style` (Constitution "Typing — structural enums vs. `Style`"). Governs `textOverflow`.
- **Consistency for plain numbers** — a numeric property with no closed value set is typed as `Style`, like every other numeric key. Governs `maxLines`.
- **Code-platforms-first naming** — names and values chosen per Constitution VI, as derived above.
- **No runtime logic** — this package gains only type declarations and schema definitions (Constitution II).

---

## Options Considered

### Option A: `textOverflow: 'CLIP' | 'ELLIPSIS'` (named enum); `maxLines: Style` *(Selected)*

- `textOverflow`: `TextOverflow | null` where `type TextOverflow = 'CLIP' | 'ELLIPSIS'`, with a `TextOverflowStyleValue` schema definition — mirrors `LayoutMode`/`Position`, and mirrors CSS/Compose for both the name and the values.
- `maxLines`: `Style`, reusing the shared `NumberStyleValue` schema definition — mirrors `width`, `opacity`, `cornerSmoothing`.

**Pros**:
- Name and values both satisfy the 2-code-platform rule (CSS + Compose), fully unbiasing from Figma.
- Each property is typed by its actual nature: closed enum → named type; plain number → `Style`.
- `Style` correctly permits a `TokenReference` for `maxLines`, matching Figma's variable-binding capability for numeric properties.

**Cons / Trade-offs**:
- The transformer must remap Figma's `DISABLED`/`ENDING` to `CLIP`/`ELLIPSIS` — a small, well-precedented value map (like `mainAxisAlignment`).

---

### Option B: Keep Figma's `textTruncation` with `'DISABLED' | 'ENDING'` *(Rejected)*

**Rejected because**: both the name ("truncation") and the values (`DISABLED`/`ENDING`) are Figma-only; no code platform uses them. Violates Constitution VI, which prefers code-platform vocabulary and treats Figma as the data source, not the naming authority.

---

### Option C: Model overflow as a boolean *(Rejected)*

A boolean such as `truncate: true | false`.

**Rejected because**: no target platform models this as a boolean — all use an enum. A boolean cannot express clip-vs-visible or truncation position (start/middle/end), is not extensible, and reads worse (`textOverflow: ELLIPSIS` is clearer than `truncate: true`).

---

## Decision

Add two flat, optional, `TEXT`-only style keys to `Styles`, one named enum type, and matching schema definitions.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `types/Styles.ts` | Add field `textOverflow: TextOverflow \| null` to `Styles` | MINOR |
| `types/Styles.ts` | Add field `maxLines: Style` to `Styles` | MINOR |
| `types/Styles.ts` | Add `export type TextOverflow = 'CLIP' \| 'ELLIPSIS'` | MINOR |
| `types/index.ts` | Re-export `TextOverflow` from the barrel | MINOR |
| `types/Styles.ts` | Add `'textOverflow'` and `'maxLines'` to the `StyleKey` union | MINOR |

**Example — new shape** (`types/Styles.ts`):
```yaml
# After — within the Styles Partial
Styles:
  textAlignHorizontal: Style
  textAlignVertical: Style
  # How overflowing text is handled. Structural — not token-bindable. TEXT only.
  textOverflow: TextOverflow | null
  # Max line count before ELLIPSIS overflow applies; null = no limit. Plain number. TEXT only.
  maxLines: Style

# New named type (enum only — maxLines needs none)
TextOverflow: "'CLIP' | 'ELLIPSIS'"
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `schema/styles.schema.json` | Add property `textOverflow` → `#/definitions/TextOverflowStyleValue` under `Styles.properties` | MINOR |
| `schema/styles.schema.json` | Add property `maxLines` → `#/definitions/NumberStyleValue` under `Styles.properties` | MINOR |
| `schema/styles.schema.json` | Add definition `TextOverflowStyleValue` | MINOR |

**Example — new shape** (`schema/styles.schema.json`):
```yaml
textOverflow:
  $ref: "#/definitions/TextOverflowStyleValue"
  description: "How overflowing text is handled — CLIP (cut off) or ELLIPSIS (trailing ellipsis). Structural property — not token-bindable."
maxLines:
  $ref: "#/definitions/NumberStyleValue"   # reuses number | TokenReference | null
  description: "Maximum number of lines before ELLIPSIS overflow applies; null or absent means no limit."

TextOverflowStyleValue:
  description: "Text overflow handling value. Structural property — not token-bindable."
  oneOf:
    - { type: string, enum: ["CLIP", "ELLIPSIS"] }
    - { type: "null" }
```

### Notes

- **`maxLines` reuses `NumberStyleValue`** — the shared definition (`number | TokenReference | null`) backing `width`, `opacity`, `cornerSmoothing`. No new type or schema definition for it.
- **Both keys optional** — `Styles` is a `Partial`; present only for `TEXT` elements. `additionalProperties: false` on the `Styles` definition means the new properties MUST be declared there for valid text output.
- **`| null` on `textOverflow`** — mirrors the sibling structural enums (`LayoutMode`, `Position`, `MainAxisAlignment`), all typed `TypeName | null`.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**:
  - `Styles.textOverflow` (`TextOverflow | null`) ↔ `Styles.properties.textOverflow` → `TextOverflowStyleValue` (`enum ["CLIP","ELLIPSIS"]` ∪ `null`).
  - `Styles.maxLines` (`Style`) ↔ `Styles.properties.maxLines` → `NumberStyleValue` (`number` ∪ `TokenReference` ∪ `null`).
  - `StyleKey` gains `'textOverflow'` and `'maxLines'`, matching the two new `Styles` properties.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Emits the two new keys for `TEXT` elements in both runtimes | None — generator already implemented: a `textOverflow` handler remaps Figma `textTruncation` → `CLIP`/`ELLIPSIS`; `maxLines` reads as a pure number. REST adapter surfaces both from `TypeStyle` via node getters. Recompiles against the new types |
| `specs-cli` | New keys may appear in validated/serialized output | Recompile against the new schema version; no code change |
| `specs-plugin-2` | New keys may appear in plugin-side spec output | Recompile against the new types; no code change |

---

## Semver Decision

**Version bump**: `0.28.0 → 0.28.0` (`MINOR`; lands within the in-progress, unreleased `0.28.0`)

**Justification**: All changes are additive — two new optional fields on `Styles`, one new exported type, two additive `StyleKey` members, and one additive schema definition (plus reuse of `NumberStyleValue`). No existing type, field, or schema property is removed, renamed, or restructured. Additive changes are `MINOR` per Constitution III and the Versioning policy. Because `0.28.0` is unreleased, the additions ride within that MINOR release.

---

## Consequences

- Spec output faithfully represents text-overflow configuration in both Plugin and REST runtimes; line-clamped and truncating text no longer lose that information.
- The schema uses code-platform vocabulary (`textOverflow`, `CLIP`/`ELLIPSIS`) rather than Figma's (`textTruncation`, `DISABLED`/`ENDING`); the transformer owns the one-way value remap.
- `maxLines` behaves like every other numeric style key — a plain number, a `TokenReference`, or `null` — and needs no special handling in consumers.
- Reverse-direction tooling (`figma-from-specs`) gains named keys to write both back to a Figma `TextNode`, inverting the remap.
- Consumers validating against `schema/styles.schema.json` must adopt schema `0.28.0`; text nodes carrying the new keys would fail validation against `0.27.0` (`additionalProperties: false`).
- `TextOverflow` becomes part of the public type surface, subject to the stability rules of Constitution III.
- The grandfathered `textAlignHorizontal: Style` / `textAlignVertical: Style` typing remains untouched.
