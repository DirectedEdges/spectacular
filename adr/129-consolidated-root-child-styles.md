# ADR: Consolidated roots record the collapsed child's styles

**Branch**: `129-consolidated-root-child-styles`
**Created**: 2026-11-25
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — extends ADR-058, ADR-083 and ADR-104)*

---

## Context

A component whose root layer wraps a single child is recorded with that wrapper gone. ADR-058 does it for a lone `text` or `glyph` child, ADR-083 for a lone slot: in both cases the child is promoted to `root`, and the spec carries **one** `elements` entry where Figma had **two** layers.

The contract already recognises that a consolidated root has two layers' worth of facts to carry, and already records two of them separately on the element that remains:

| Fact of the collapsed child | Where it is recorded | Introduced by |
|---|---|---|
| Its Figma layer name | `anatomy.<key>.$extensions['com.figma'].name` | ADR-058 |
| Its behavior role | `anatomy.<key>.$extensions['com.figma'].childRole` | ADR-104 |
| **Its styles** | **nowhere** | — |

`childRole`'s own declaration states the general principle: "Collapse leaves one anatomy element where Figma has two layers, so a role has to say which layer carried it." That is equally true of every style key, and the third row is the gap this ADR closes.

### The consolidated root's single style map cannot hold both layers

`Element.styles` is one map, so the two layers' styles must merge into it. Where both layers declare the same key, one value is kept and the other has nowhere to go. That is not confined to one key group — a wrapper and its child can independently declare sizing, dimensions, padding, alignment, corner radius, strokes, fills, effects and opacity.

### The merge can produce a document that contradicts its own schema

The contract states that a dimension applies on one condition. `schema/styles.schema.json` describes `height` as:

> The element's height in pixels when vertical sizing is FIXED.

So these two keys cannot both be true of one box, and a consolidated root can be written carrying both:

```yaml
# A component root fixed to a density token, wrapping a slot that hugs.
default:
  elements:
    root:
      styles:
        layoutMode: HORIZONTAL
        layoutSizingVertical: HUG                            # the child layer's
        height:                                              # the root layer's
          $token: DS Density/control/height/sm
          $type: dimension
```

Each value is correct about its own layer. Together on one element they describe a box that is both sized by its content and fixed to 32 pixels. A reader has no basis for choosing, and the document is invalid against its own `height` description.

### Three facts, one place to put them

The example above is a component whose root is fixed to a density token, holding a slot that hugs inside it, aligned on the cross axis. Three facts, and the single style map can hold one:

| Fact | Layer it belongs to |
|---|---|
| Fixed height, bound to `DS Density/control/height/sm` | the root |
| Vertical sizing `HUG` | the child |
| Cross-axis alignment positioning the child in the root's 32px | the root |

### Why an extension field, and why it needs an ADR

`$extensions['com.figma']` is where a Figma-side fact that no code platform consumes already lives, and `ElementExtensions` in `schema/component.schema.json` declares `"additionalProperties": false`. The extension namespace is **closed**, not free-form, so a new member is a schema change under Principle I and cannot be introduced by a producer alone.

### Out of scope

- **Which layer's value wins in the plain style map.** This ADR gives the second layer a home; it does not restate the merge, which is a producer concern.
- **Whether consolidation should apply to more components than it does today.** The eligibility rules exist partly because some styles have nowhere to go; that premise changes once they do, but which components collapse is not a contract question.

---

## Decision Drivers

- **Type ↔ schema parity (Principle I)** — any field added to `types/` has a counterpart in `schema/`, both ways.
- **No logic (Principle II)** — the schema declares where a fact is recorded. It cannot express a merge rule or a precedence order, and must not try to.
- **The contract's own coherence (Principle III)** — the justification is that the document contradicts its own declared meaning of `height`, and that two of three collapsed-child facts are already recorded. No consumer's internal model is cited.
- **Minimal, stable API (Principle III)** — one additive optional field, not a parallel element entry or a second style map on every element.
- **Naming governance (Principle VI)** — the new member names a Figma layer relationship, and no code platform expresses an opinion about it, so rule 3 applies: follow the model already established in this contract.
- **Additive only** — the field is optional and absent on every spec generated to date, so no existing document becomes invalid.
- **Reversibility is the point** — a consolidation that discards a value is not reversible, and ADR-058 and ADR-083 both claim round-trip fidelity.

---

## Options Considered — where the collapsed child's styles are recorded

### Option A: A `childStyles` member on `FigmaElementExtension` *(Selected)*

Add one optional field to `types/Element.ts`'s `FigmaElementExtension`, holding the collapsed child layer's own `Styles`.

```yaml
default:
  elements:
    root:
      styles:
        layoutMode: HORIZONTAL
        crossAxisAlignment: CENTER
        height:
          $token: DS Density/control/height/sm
          $type: dimension
      $extensions:
        com.figma:
          childStyles:
            layoutMode: HORIZONTAL
            layoutSizingHorizontal: FILL
            layoutSizingVertical: HUG
```

**Pros**:

- `FigmaElementExtension` already carries a `styles` member for the same class of problem — ADR-074 records the styles a promotion consumed, "recorded verbatim as captured," so that a transformed layer can be restored. A collapsed child is the same kind of fact in the same type.
- Styles live on `elements` and structure lives on `anatomy` throughout the contract. This keeps that line intact.
- `root.styles` becomes unambiguously the root layer's, so the `height` description holds again with no new condition attached to it.
- One optional field. No existing document changes, and no element that was not consolidated carries anything new.

**Cons / Trade-offs**:

- The collapsed child's facts are then split across two extensions — `name` and `childRole` on the anatomy element, `childStyles` on the element. The split follows the existing structure/styles division rather than cutting across it, but a reader restoring the child reads two places.

---

### Option B: A `childStyles` member on `FigmaAnatomyElementExtension` *(Rejected)*

Put the field beside `name` and `childRole`, so all three collapsed-child facts sit together.

**Rejected because**: `AnatomyElement` declares type, role, actions and instance identity — it carries no styles anywhere, and `Styles` is reached only from `Element`. Introducing a style map into the anatomy tree to co-locate three fields trades a first-order boundary for a second-order convenience, and it would make `anatomy` a second place to look for styling.

---

### Option C: A `childSizing` member holding only the sizing axes *(Rejected)*

Record `layoutSizingHorizontal`, `layoutSizingVertical`, `width` and `height` for the child, and nothing else.

**Rejected because**: it fixes the key group where the conflict was first noticed and leaves the rest. A wrapper and its child can independently declare `padding`, `crossAxisAlignment`, `cornerRadius`, `strokes`, `backgroundColor`, `effects` and `opacity` — each a real divergence with the same single-map problem — so the field would need extending on the next group discovered. An enumerated subset also puts the contract in the business of ranking style keys, which Principle II keeps out of this package.

---

### Option D: Record nothing; narrow consolidation instead *(Rejected)*

Leave the contract alone and refuse to consolidate whenever the two layers' styles conflict.

**Rejected because**: it resolves the contradiction by producing a different document shape for designs that differ only in a style value, so whether a component's spec has a wrapper would depend on whether its child happened to hug. It also forfeits what ADR-058 and ADR-083 were for. The contract's job is to have somewhere to put the fact; declining to record it is not a schema decision.

---

## Options Considered — what `childStyles` holds

### Option A: The child layer's complete style map *(Selected)*

`childStyles` is the child's own `Styles`, as captured, independent of what the root's map contains.

**Pros**:

- Each map means one thing: `styles` is the root layer's, `childStyles` is the child layer's. Neither is read relative to the other.
- No key list to maintain, so a style key added to `Styles` in a later ADR is covered with no further change here.
- Satisfies Principle II — the schema declares a location, not a comparison.

**Cons / Trade-offs**:

- Keys the two layers agree on are written twice. The duplication is bounded by the number of keys one element carries and only occurs on consolidated roots.

### Option B: Only the keys where the two layers disagree *(Rejected)*

Record the child's value only where it differs from the root's.

**Rejected because**: the field's meaning would then depend on the sibling map's contents, so a consumer must compare the two to know what it is holding. That is a merge rule expressed in the schema, which Principle II forbids this package from carrying.

---

## Options Considered — vocabulary

### Option A: `childStyles` *(Selected)*

**Pros**:

- `FigmaAnatomyElementExtension.childRole` already names the collapsed child's facts with a `child` prefix, in the same `com.figma` namespace, for the same reason. `childStyles` reads as its counterpart.
- `styles` matches the existing member on `FigmaElementExtension` and the `Styles` type it holds — Principle VI rule 3, following the model this contract already established.
- Unabbreviated, and accurate for all three consolidation kinds. A `text`, `glyph` or slot child is a child either way.

### Option B: `childSizing` *(Rejected)*

**Rejected because**: it names a key group rather than the layer, so it would be wrong as soon as the field holds anything else — which the scope decision above settles that it does.

### Option C: `collapsedChildStyles` *(Rejected)*

**Rejected because**: `childRole` establishes that `child` means "the layer collapse folded in" within this namespace, so `collapsed` restates the context the field already sits in.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Element.ts` | Added optional field `childStyles?: Styles` to `FigmaElementExtension` | MINOR |

**Example — new shape** (`types/Element.ts`):

```yaml
# Before
FigmaElementExtension:
  promotedPrimitive?: boolean
  multipleMatches?: boolean
  content?: string | PropBinding
  styles?: Styles
  children?: SlotContentRef

# After
FigmaElementExtension:
  promotedPrimitive?: boolean
  multipleMatches?: boolean
  content?: string | PropBinding
  styles?: Styles
  children?: SlotContentRef
  childStyles?: Styles     # optional — MINOR
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added property `childStyles` to `#/definitions/FigmaElementExtension` | MINOR |

**Example — new shape** (`schema/component.schema.json`):

```yaml
# New property under #/definitions/FigmaElementExtension/properties
childStyles:
  $ref: "#/definitions/Styles"
  description: "The styles of the layer that wrapper collapse folded into this element, recorded verbatim as captured."
  # not in required[] — optional field
```

`"additionalProperties": false` on `FigmaElementExtension` is unchanged; `childStyles` is declared explicitly.

### Notes

- **Optional, not required.** It is meaningful only on a consolidated root, which is a minority of elements. Absence means this element stands for one Figma layer.
- **No companion flag.** Unlike `promotedPrimitive`, presence is self-describing: a consolidated root is already identifiable from `anatomy.<key>.$extensions['com.figma'].name`, which ADR-058 records on every collapse regardless of key format.
- **Variant diffs.** A non-default variant carries only what differs from the default, and `childStyles` participates on the same terms as the `styles` beside it — a variant that changes nothing about the child carries no `childStyles`.
- **Compositions.** A composition's elements have the same shape, so a consolidated root in `elements` carries the field identically. No composition-specific declaration is needed.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `FigmaElementExtension.childStyles` in `types/Element.ts` ↔ `#/definitions/FigmaElementExtension/properties/childStyles` in `schema/component.schema.json`, typed `Styles` ↔ `$ref: "#/definitions/Styles"`. `Styles` and its `#/definitions/Styles` counterpart are unchanged, so no second parity obligation is created.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Recompile | Validates specs against the published schema; the new optional property must be accepted |
| `specs-from-figma` | Update usage | Writes the field when a consolidation discards a style the remaining element cannot hold |
| `figma-from-specs` | Update usage | Reads the field to style the layer it recreates, rather than deriving that layer's styles from the root's |
| `react-from-specs` | None | Reads the platform-facing element contract; a `com.figma` provenance field is not a code-platform concern |
| `webcomponents-from-specs` | None | Same as `react-from-specs` |
| `from-specs` | None | Shared emitter core, same contract surface as the two emitters |
| `specs-plugin-2` | Recompile | Consumes the schema through the transform packages |

---

## Semver Decision

**Target version**: `0.42.0` — the version of `@directededges/specs-schema` on the active `release/next` branch.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: One additive optional field on an existing interface, with its declared schema counterpart. No type or property is removed, renamed, or made required, and no existing document becomes invalid. Constitution "Versioning": `MINOR` for additive types or new optional fields.

---

## Consequences

- A consolidated root records both layers' styles, so `elements.root.styles` means the root layer's styles and nothing else.
- The `height` and `width` descriptions hold on every element again — a dimension sits beside `FIXED` sizing or beside no sizing key, never beside `HUG` or `FILL`.
- Consolidation becomes reversible for the whole style surface rather than for an enumerated subset, which is what ADR-058 and ADR-083 claim of it.
- A producer that records nothing is still valid, so specs generated before this field exists stay readable and consumers must treat its absence as "this element stands for one layer."
- `childStyles` and `FigmaElementExtension.styles` sit side by side and mean different things — the collapsed child's own styles, and the styles a promotion consumed (ADR-074). Both are restoration records, and a reader of either needs the other's definition to tell them apart.
- The eligibility rules that keep some wrappers from collapsing are partly premised on styles having nowhere to go. That premise no longer holds, so whether consolidation should widen becomes an open question — raised here, decided elsewhere.
