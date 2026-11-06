# ADR: Introduce `PropBinding` to Replace `ReferenceValue` Unions for Bound Properties

**Branch**: `v0.11.0`
**Created**: 2026-03-02
**Status**: ACCEPTED
**Summary**: A `PropBinding` type keyed `$binding` replaces `ReferenceValue` unions wherever a value is bound to a prop.
**Decides**: styles.visible
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

Three element properties — `instanceOf`, `text`, and `visible` — can be bound to a Figma component property at extraction time. The current `anova` type model represents this binding through a `string | ReferenceValue` union (for element properties) or via the `Style` union (which includes `ReferenceValue` for `visible`).

`ReferenceValue` uses `$ref` as its single key:

```yaml
# Current bound form (ReferenceValue)
$ref: "#/props/label"
```

Two problems exist with the current model:

- **`$ref` key collision**: `$ref` carries deeply entrenched semantics in JSON Schema — validators may attempt to follow it as a schema pointer rather than treat it as an opaque data value. Using it inside serialized *output data* conflates the two roles and creates validator ambiguity.
- **Name and intent mismatch**: `ReferenceValue` describes the shape (`an object with a $ref`) rather than the concept (a property bound to a component prop). `BindingKey` in `types/ReferenceValue.ts` correctly names the concept but the primary type does not.

Prop defaults are not a missing piece of information: each `Prop` definition in the spec's `props` block carries a `default` field, and `string`/`instance` prop types support an `examples` property for representative values. There is no need for the binding object itself to duplicate the resolved value.

---

## Decision Drivers

- **Type ↔ Schema sync**: Every type change has a symmetric schema change — no drift permitted (Constitution I).
- **No logic**: The new type must be a pure interface or type alias — no classes, methods, or algorithms (Constitution II).
- **Stable API / MAJOR discipline**: Removing `ReferenceValue` or changing the shape of the bound wire format is a breaking change. It must be versioned `MAJOR` (Constitution III).
- **No key collision with JSON Schema**: The binding key must not be `$ref` — that key has reserved validator semantics in JSON Schema and must not appear in output data with a different meaning.
- **No denormalization**: The binding object must not carry a copy of the resolved value. Canonical defaults live in `Props.default`; representative values live in `Props.examples`. Two sources of truth for the same fact create drift risk.
- **Strict-mode TypeScript**: The new types must compile under strict mode with zero `any` (Constitution V).
- **`isReferenceValue` guard replacement**: The only permitted runtime export from this package besides `DEFAULT_CONFIG` is `isReferenceValue`. If `ReferenceValue` is removed, its guard must be replaced with a guard for the successor type, with explicit justification under Constitution II.

---

## Options Considered

### Option A: Introduce `PropBinding` with `$binding` key only; deprecate `ReferenceValue` *(Selected)*

Add a new `PropBinding` interface with a single `$binding` key. Replace the `string | ReferenceValue` unions in `Element` and the `ReferenceValue` branch in `Style` with `string | PropBinding` and `boolean | PropBinding` respectively. Deprecate `ReferenceValue`.

```yaml
# New bound form (PropBinding)
$binding: "#/props/label"
```

**Pros**:
- No `$ref` key collision — `$binding` has no JSON Schema validator semantics and unambiguously signals a component-prop binding.
- Minimal and non-denormalized — the binding pointer is the complete contract; defaults remain in `Props.default` and `Props.examples`.
- `BindingKey` semantics are enforced at the type level: all bindable fields share the same `PropBinding` shape.
- All consumers can discriminate a bound property from an unbound one with a single key check (`'$binding' in val`).

**Cons / Trade-offs**:
- MAJOR breaking change — old emitted output using `{ $ref }` fails schema validation against the updated schema.
- `isReferenceValue` guard is replaced by `isPropBinding`.

---

### Option B: Include `value` alongside `$binding` in `PropBinding` *(Rejected)*

Emit `{ value: string | boolean | number, $binding: string }` so consumers have the Figma-resolved raw value inline.

**Rejected because**: Prop defaults already have a canonical location — `Props.default` for the declared default and `Props.examples` for representative string/instance values. Duplicating the resolved value in the binding object creates two sources of truth that can drift across variants (a node's extracted value at one variant may differ from another), and adds payload to every bound property in every spec file with no architectural benefit.

---

### Option C: Rename `$ref` → `$binding` in place on `ReferenceValue`; keep the type name *(Rejected)*

Keep `ReferenceValue` as the published type; change only its key from `$ref` to `$binding`.

**Rejected because**: The type name `ReferenceValue` describes the object shape, not the concept. The concept is a *component-prop binding*. Retaining the old name while changing the key still leaves consumers with a poorly named abstraction and does not improve the alignment between `BindingKey` (which correctly names the concept) and the primary interface.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `ReferenceValue.ts` | Add `PropBinding` interface (`{ $binding: string }`); deprecate `ReferenceValue`; replace `isReferenceValue` guard with `isPropBinding` | MAJOR |
| `Element.ts` | Change `instanceOf` and `text` from `string \| ReferenceValue` to `string \| PropBinding` | MAJOR |
| `Styles.ts` | Change `Style` union — remove `ReferenceValue`; add `PropBinding` | MAJOR |

**Example — `types/ReferenceValue.ts` new shape**:
```yaml
# Before
ReferenceValue:
  $ref: string   # JSON Schema key — validator collision risk

# After — PropBinding replaces ReferenceValue
PropBinding:
  $binding: string   # e.g. "#/props/propName" — no validator semantics
```

**Example — `types/Element.ts` before/after**:
```yaml
# Before
Element:
  instanceOf: string | ReferenceValue   # bound: { $ref: "#/props/swap" }
  text: string | ReferenceValue         # bound: { $ref: "#/props/label" }

# After
Element:
  instanceOf: string | PropBinding      # bound: { $binding: "#/props/swap" }
  text: string | PropBinding            # bound: { $binding: "#/props/label" }
```

**Example — `types/Styles.ts` visible before/after**:
```yaml
# Before
Style: string | boolean | number | null | TokenReference | ReferenceValue

# After
Style: string | boolean | number | null | TokenReference | PropBinding
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Replace `ReferenceValue` definition with `PropBinding` (key `$binding`); update all internal `$ref`s pointing to it in `Element` | MAJOR |
| `styles.schema.json` | Replace `BooleanBindableStyleValue` `{ $ref: "component.schema.json#/definitions/ReferenceValue" }` branch with `{ $ref: "component.schema.json#/definitions/PropBinding" }` | MAJOR |

**Example — `#/definitions/PropBinding` in `component.schema.json`**:
```yaml
# Before — ReferenceValue
ReferenceValue:
  type: object
  properties:
    $ref:
      type: string
      description: "JSON pointer to the referenced prop, e.g. '#/props/propName'"
  required: [$ref]
  additionalProperties: false

# After — PropBinding
PropBinding:
  type: object
  description: "A component-prop binding. Emitted when a property is bound to a component prop."
  properties:
    $binding:
      type: string
      description: "JSON Pointer to the bound prop, e.g. '#/props/propName'"
  required: [$binding]
  additionalProperties: false
```

**Example — `Element.instanceOf` in `component.schema.json`**:
```yaml
# Before
instanceOf:
  oneOf:
    - type: string
    - $ref: "#/definitions/ReferenceValue"

# After
instanceOf:
  oneOf:
    - type: string
    - $ref: "#/definitions/PropBinding"
```

**Example — `BooleanBindableStyleValue` in `styles.schema.json`**:
```yaml
# Before
BooleanBindableStyleValue:
  oneOf:
    - type: boolean
    - $ref: "component.schema.json#/definitions/ReferenceValue"

# After
BooleanBindableStyleValue:
  oneOf:
    - type: boolean
    - $ref: "component.schema.json#/definitions/PropBinding"
```

### Notes

- `BindingKey` in `types/ReferenceValue.ts` is not changing — the set of bindable fields (`children`, `instanceOf`, `visible`, `text`) remains correct. The file may be renamed to `PropBinding.ts` to match the primary export.
- `children` slot-binding uses the same pointer pattern and will adopt `PropBinding` in a follow-up ADR.
- `isReferenceValue` is currently the sole permitted runtime export (beyond `DEFAULT_CONFIG`) under Constitution II. It must be replaced by `isPropBinding`. The old guard should be marked `@deprecated` and removed at this MAJOR boundary.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `PropBinding` (TypeScript) ↔ `#/definitions/PropBinding` in `component.schema.json`
  - `Element.instanceOf: string | PropBinding` ↔ `#/definitions/Element/properties/instanceOf` (`oneOf: string | PropBinding`)
  - `Element.text: string | PropBinding` ↔ `#/definitions/Element/properties/text` (`oneOf: string | PropBinding`)
  - `Style` union including `PropBinding` ↔ `BooleanBindableStyleValue` in `styles.schema.json` (`oneOf: boolean | PropBinding`)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile; update any type narrowing on `instanceOf`, `text`, or `visible` that checks for `ReferenceValue` | Replace `isReferenceValue(val)` guards with `isPropBinding(val)`; read `val.$binding` for the prop pointer |

---

## Semver Decision

The version bump from `0.11.0` targets the next appropriate boundary; given the pre-1.0 position of the package and the bundling intent with `v0.11.0`, this change is expected to ship as part of the `0.11.0` breaking release bundle alongside ADR 006.

**Justification**: The bound wire format for `instanceOf`, `text`, and `visible` changes structurally — old serialized output where bound values are `{ $ref }` only will fail validation against the updated schema. Any consumer performing type narrowing via `isReferenceValue` or checking `'$ref' in val` as a complete shape test will require code changes. Per Constitution III: "Removing or renaming an exported type or a named field within a type is a breaking change and MUST follow semantic versioning."

---

## Consequences

- Serialized output for bound properties uses `{ $binding: "#/props/..." }` — unambiguous, no JSON Schema validator collision.
- Prop defaults remain in their canonical location (`Props.default`); representative values for `string` and `instance` props remain in `Props.examples`. The binding object carries no duplicated value.
- `PropBinding` becomes the single, canonical type for all bound scalar properties in the Anova spec.
- `ReferenceValue` is deprecated at this version boundary and removed in the same MAJOR release.
- `isReferenceValue` is replaced by `isPropBinding`; the old guard is marked `@deprecated` and removed at this boundary.
- Any tool that produces or consumes spec files must update its handling of bound properties: emit `{ $binding }` and discriminate on `'$binding' in val`. Old spec files emitting `{ $ref }` for bound properties will fail schema validation; regeneration is required.
- `children` slot-binding (`BindingKey: 'children'`) is not included in this change; a follow-up ADR will address it separately.
