# ADR: Authoring-default images on `ImageProp`

**Branch**: `088-image-prop-examples`
**Created**: 2026-09-14
**Status**: ACCEPTED
**Summary**: An `examples` field on `ImageProp` carries authoring-default images alongside `default` and `nullable`, matching `ImageBinding.examples`.
**Decides**: props.image.examples
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — extends ADR-063)*

---

## Context

ADR-063 introduced the image model: an `images` registry per component, `ImageValue`
pointers into it, `ImageProp` for image-valued properties, and `ImageBinding` for
forwarding a parent's image into a nested image instance.

It placed the authoring-default image at exactly one location — the binding site:

```ts
/**
 * Image-valued property definition (e.g. a `dsImage` `source` prop, or a parent
 * prop forwarded into it). The authoring-default image rides on the
 * `ImageBinding` at the binding site, not on the prop.
 */
export interface ImageProp {
  type: 'image';
  default?: string | null;
  nullable?: boolean;
  $extensions?: PropExtensions;
}
```

That works whenever an image component is *consumed*. A parent's element carries an
`ImageBinding` under the child's source-prop key, and `examples` on that binding names
the image the designer placed there:

```yaml
# a consuming component's variants.yaml
propConfigurations:
  imageSource:
    $binding: "#/props/imageSource"
    examples:
      - $image: "#/components/parent/images/parent__image"
```

The gap is the image component **considered on its own**. A designated image component
is the origin of the image, not a consumer of one — it has no parent, therefore no
binding site, therefore nowhere in its own spec to record the image it was authored
with. Its `images` registry holds the entry, its elements reference it through
`Styles.backgroundImage`, and its source prop — the prop that actually drives the image
at runtime — carries nothing:

```yaml
# the image component's own api.yaml — today
props:
  imageSource:
    type: image          # no default, no examples: nothing to demonstrate with
```

This is a hole in the contract rather than a rendering detail. Every other open-valued
prop type can carry sample content, and the binding form of this very prop already can:

| Type | Value set | Carries samples |
|------|-----------|-----------------|
| `StringProp` | open | `examples?: string[]` |
| `NumberProp` | open | `examples?: number[]` |
| `BooleanProp` | closed | not needed — value set is enumerable |
| `EnumProp` | closed | not needed — value set is enumerable |
| `SlotProp` | open | `Component.slotContentExamples` |
| `ImageBinding` | open | `examples?: ImageValue[]` |
| **`ImageProp`** | **open** | **— nothing —** |

`ImageProp` is the only open-valued prop in `AnyProp` with no way to carry sample
content, and the asymmetry between `ImageProp` and `ImageBinding` is the sharper half:
the same image, expressed as a binding, has a home; expressed as a prop, it does not.

---

## Decision Drivers

- **Contract coherence**: sample content is a property of an open-valued prop, and the
  contract already says so twice (`StringProp.examples`, `NumberProp.examples`) and a
  third time for the bound form of this prop (`ImageBinding.examples`).
- **`default` stays contractual**: a default is part of a component's API — it says what
  the prop resolves to when a consumer omits it. Demo content is not that. The contract
  already separates the two and marks the conflation as a mistake: `StringProp.default`
  is `@deprecated` with the note *"Use `examples` for demo content"*.
- **Additive only**: no existing spec may become invalid, so the change must be a new
  optional field — MINOR per constitution *Versioning*.
- **Type ↔ Schema symmetry** (Constitution I): every type change has a schema counterpart.
- **No new vocabulary**: prefer an existing field name and an existing value shape over
  inventing either (Constitution III — minimal, stable, intentional public API).
- **Justified by the contract, not by a consumer** (Constitution III): the case rests on
  the asymmetry in the prop table above, not on what any downstream package does with it.

---

## Options Considered

### Decision 1 — Where a designated image component records its authoring-default image

#### Option A: Add `examples` to `ImageProp` *(Selected)*

Give `ImageProp` the same optional `examples` field that every other open-valued prop
carries. The prop's contract — `default`, `nullable` — is untouched.

```yaml
props:
  imageSource:
    type: image
    examples:
      - $image: "#/components/deImage/images/deImage__image"
```

**Pros**:
- Closes the asymmetry named in Context: `ImageProp` gains what `StringProp`,
  `NumberProp`, and `ImageBinding` already have, under the same field name.
- Keeps `default` contractual — a prop with sample content still resolves to
  `undefined` when unset, so no consumer's API changes.
- Purely additive: an optional field on an existing interface. No existing spec
  becomes invalid.
- Symmetric by construction — one field in `types/Image.ts`, one property in
  `schema/component.schema.json`.

**Cons / Trade-offs**:
- Two places can now carry an authoring-default image for the same prop (the prop and
  the binding). They describe different situations — the component's own authoring
  versus a specific consumer's placement — but a reader must know which is which.
  Mitigated by field documentation stating the precedence: a binding's `examples`
  describe that binding site; a prop's `examples` describe the component itself.

---

#### Option B: Reuse `ImageProp.default` *(Rejected)*

`default?: string | null` already exists and already accepts a registry reference, so
this needs no schema change at all.

**Rejected because**: it violates the *`default` stays contractual* driver. A default is
an API commitment about what the prop resolves to when omitted; putting demo content
there makes every image component claim a default it does not have. The contract has
already been down this road and reversed: `StringProp.default` carries
`@deprecated — Use examples for demo content`. Adopting for images the exact pattern the
string case deprecated would re-introduce a known mistake.

---

#### Option C: Leave the authoring-default on `ImageBinding` only *(Rejected)*

Status quo. The image is recorded wherever the component is consumed.

**Rejected because**: it violates *contract coherence*. A designated image component has
no binding site in its own spec, so the location the contract designates for this
information does not exist for the one component type that most needs it. The
information is representable only from the outside, which makes a component's spec
incomplete on its own terms.

---

### Decision 2 — The element type of `ImageProp.examples`

#### Option A: `ImageValue[]` *(Selected)*

```ts
examples?: ImageValue[];
```

**Pros**:
- Identical to `ImageBinding.examples`, so the same value is spelled the same way
  whether it sits on the prop or on a binding — no translation between the two forms.
- Carries `objectFit` alongside the pointer. An authoring-default image fitted
  `CONTAIN` keeps that fit.
- Reuses an existing type — no new vocabulary.

**Cons / Trade-offs**:
- Heavier than a bare pointer string for the common case where `objectFit` is absent.

---

#### Option B: `string[]` (bare registry pointers) *(Rejected)*

```ts
examples?: string[];
```

**Rejected because**: it drops `objectFit`, and it makes the prop form and the binding
form of the same information structurally different — `ImageBinding.examples` is
`ImageValue[]`. ADR-063 modelled `ImageValue` as an object specifically so that fit "and
future optional subproperties attach without a breaking change"; a parallel `string[]`
field forfeits that and would need a MAJOR change to recover it.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Image.ts` | Added optional field `examples` to `ImageProp` | MINOR |
| `Image.ts` | Amended `ImageProp` doc comment — the authoring-default image rides on the binding *or* on the prop | PATCH |

**Example — new shape** (`types/Image.ts`):
```yaml
# Before
ImageProp:
  type: 'image'
  default?: string | null
  nullable?: boolean
  $extensions?: PropExtensions

# After
ImageProp:
  type: 'image'
  default?: string | null
  nullable?: boolean
  examples?: ImageValue[]        # optional — MINOR
  $extensions?: PropExtensions
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added property `examples` under `#/definitions/ImageProp/properties` | MINOR |
| `component.schema.json` | Amended `#/definitions/ImageProp` description | PATCH |

**Example — new shape** (`schema/component.schema.json`):
```yaml
# New property under #/definitions/ImageProp/properties
examples:
  type: array
  items:
    $ref: "styles.schema.json#/definitions/ImageValue"
  description: >-
    Authoring-default example images for this prop — the image the component was
    authored with. Non-contractual reference material, parallel to StringProp.examples.
  # not in required[] — optional field
```

### Notes

- The `$ref` target and `description` phrasing deliberately match
  `#/definitions/ImageBinding/properties/examples`, which already points at
  `styles.schema.json#/definitions/ImageValue`. The two fields are the same idea at two
  locations and should read as such.
- `ImageProp` sets `additionalProperties: false`, so the property must be declared
  explicitly — a spec emitting `examples` today fails validation.
- **Precedence, to be stated in both doc comments**: `ImageBinding.examples` describes
  the image at *that binding site*; `ImageProp.examples` describes the image the
  component itself was authored with. Where both exist for one rendered instance, the
  binding is the more specific statement.
- `default` is unchanged in type, presence, and meaning. This ADR does not deprecate it
  — an image prop with a genuine contractual default remains expressible.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**: `ImageProp.examples?: ImageValue[]` (`types/Image.ts`) ↔
  `#/definitions/ImageProp/properties/examples` as an array of
  `styles.schema.json#/definitions/ImageValue` (`schema/component.schema.json`). Optional
  in the type, absent from `required[]` in the schema. The referenced `ImageValue`
  definition is unchanged by this ADR.

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | May now populate `examples` on an image-typed prop when a component carries its own image fill and has an image-typed prop to attach it to | Recompile; optionally emit the new field |
| `specs-cli` | Reads and writes the field as part of the prop; image resolution already rewrites registry entries, and `examples` references the same registry | Recompile; resolve pointers in the new field alongside existing ones |
| `specs-plugin-2` | Same contract as `specs-from-figma` — the field is within the detect-phase budget, carrying a pointer rather than bytes | Recompile |

No consumer is required to emit or read `examples` for existing specs to keep validating
— the field is optional and absent by default.

---

## Semver Decision

**Target version**: `0.33.0` — the version of `packages/schema` on the active
`release/next` branch.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: The change adds one optional field to an existing interface and one
optional property to its schema definition. Constitution *Versioning*: "`MINOR` for
additive types or new optional fields." No field is renamed, removed, or changed in
type, so no existing spec becomes invalid and no consumer breaks by not adopting it.

---

## Consequences

- A designated image component's spec is complete on its own terms — the image it was
  authored with is recorded on the component, not only at the sites that consume it.
- The prop table in Context closes: every open-valued prop type in `AnyProp` can carry
  sample content.
- `ImageProp` and `ImageBinding` express authoring-default images identically, so moving
  a value between the two forms is a relocation rather than a translation.
- Two locations can carry an authoring-default image for one prop. The doc comments must
  state the precedence, or the contract acquires an ambiguity it did not have before.
- Consumers that generate demo or documentation output gain a source for image content
  where they previously had none. Adoption is optional — the field is absent from every
  spec generated before this change.
- Any tool validating against `component.schema.json` must move to the version carrying
  this definition before it can accept a spec that emits `examples` on an image prop,
  because `ImageProp` is `additionalProperties: false`.
