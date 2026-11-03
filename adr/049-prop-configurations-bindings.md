# ADR: Prop Configurations and Bindings

**Branch**: `049-prop-configurations-bindings`
**Created**: 2026-04-29
**Status**: ACCEPTED
**Summary**: `PropConfigurations` values accept `PropBinding` and `SlotContentRef`, so a configuration can forward a prop or fill a slot.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Depends on**: [ADR-008 — Introduce PropBinding](008-prop-binding), [ADR-042 — Composition Structural Type](042-composition-type), [ADR-046 — Slots and Slot References](046-slots-and-slot-references), [ADR-047 — Component Slot Examples](047-component-slot-examples), [ADR-048 — Component Instance Examples](048-component-instance-examples)

---

## Context

`PropConfigurations` lives on `Element` and sets a nested instance's props — e.g. fixing a nested `Button`'s `variant` to `"primary"`. Its current type accepts scalars only:

```ts
// types/PropConfigurations.ts (today)
type PropConfigurations = Record<string, string | number | boolean>;
```

### Where `PropBinding` is already accepted

`PropBinding` (`{ $binding: "#/props/<name>" }`, from ADR-008) lets a field's value be forwarded from a parent prop at emission time. It is already permitted on three element-level fields:

```ts
// types/Element.ts (today — unchanged by this ADR)
type Element = {
  content?:    string | PropBinding;                     // ✅ binding accepted
  instanceOf?: string | PropBinding | SubcomponentRef;   // ✅ binding accepted
  styles?:     Styles;                                   //   (Styles.visible: boolean | PropBinding) ✅
  propConfigurations?: PropConfigurations;               // ❌ scalar only — gap 1
  // ...
};
```

### Two gaps

**Gap 1 — scalar prop forwarding.** A `Card` that exposes a `label` prop and forwards it to a nested `Button` can already express the *content* case, but not the *propConfigurations* case:

```yaml
props:
  label: { type: string }

elements:
  cardTitle:
    content: { $binding: "#/props/label" }          # ✅ already works

  nestedButton:
    instanceOf: Button
    propConfigurations:
      label: { $binding: "#/props/label" }          # ❌ rejected by current type
```

**Gap 2 — slot prop fills.** `SlotContentRef` (`{ $slotContent: string }`, from ADR-046) fills a nested instance's slot prop with named content. `Element.propConfigurations` has no way to express this today:

```yaml
elements:
  actionItem:
    instanceOf: ActionListItem
    propConfigurations:
      startVisual:
        $slotContent: "#/components/actionListItem/slotContentExamples/searchIcon"  # ❌ rejected
```

Widening `PropConfigurations` to accept both `PropBinding` and `SlotContentRef` closes both gaps and makes the binding and fill model uniform across all element-level value fields.

### Distinction from `InstanceExample.propConfigurations`

ADR-048 widened `InstanceExample.propConfigurations` to `string | number | boolean | SlotContentRef`. This ADR widens `Element.propConfigurations` to `string | number | boolean | PropBinding | SlotContentRef`. The difference is `PropBinding`: instance examples are documented configurations for human readers and tooling — live bindings do not belong there. `Element.propConfigurations` is the live element tree — both bindings and slot fills are valid.

---

## Decision Drivers

- **Consistent binding model** — `PropBinding` is the established pattern for pass-through bindings on element-level fields; `PropConfigurations` is the only one that cannot participate
- **Consistent slot fill model** — `SlotContentRef` is the established pointer for slot fills (ADR-046); `Element.propConfigurations.<slotName>` is where a nested instance's slot prop is filled from a parent element
- **Additive at the data level** — the union is widened, not replaced: every previously-valid value stays valid and no field is removed or renamed. (This is still source-breaking for consumers that narrowed the value type — see Cons and Semver Decision.)
- **`InstanceExample.propConfigurations` stays without PropBinding** — that type represents a documented configuration; live bindings belong in `Element.propConfigurations` only
- **Type ↔ schema symmetry** — Constitution §I
- **No runtime logic** — Constitution §II

---

## Options Considered

### Option A: Widen `PropConfigurations` value union to include `PropBinding` and `SlotContentRef` *(Selected)*

Add `PropBinding` and `SlotContentRef` as additional branches alongside `string`, `number`, and `boolean`.

```ts
// Before
type PropConfigurations = Record<string, string | number | boolean>;

// After
type PropConfigurations = Record<string, string | number | boolean | PropBinding | SlotContentRef>;
```

A single `propConfigurations` block can mix all value forms:

```yaml
props:
  isDisabled: { type: boolean }
  startVisual: { type: slot }

elements:
  actionItem:
    instanceOf: ActionListItem
    propConfigurations:
      variant: default                                                                   # static scalar
      isDisabled: { $binding: "#/props/isDisabled" }                                   # PropBinding — forwarded from parent
      startVisual:
        $slotContent: "#/components/actionListItem/slotContentExamples/searchIcon"     # SlotContentRef — slot fill
```

**Pros**:
- Closes both gaps in one widening — scalar, binding, and slot fill are all expressed in the same field
- Completes the binding pattern established on `Element.content`, `Element.instanceOf`, and `Styles.visible`
- `SlotContentRef` is discriminated by `$slotContent`; `PropBinding` by `$binding` — no ambiguity between arms
- Existing scalar values remain valid — already-emitted specs still validate against the widened schema (data-level backward compatibility)

**Cons / Trade-offs**:
- **Source-breaking for typed consumers.** Widening the value union breaks consumers that narrowed `propConfigurations` values to a single shape (e.g. `value as number`, or a non-exhaustive `switch`/`if`): they will mishandle — or fail to type-check against — the new `PropBinding` and `SlotContentRef` arms until updated to handle all four value shapes. Already-emitted *data* stays schema-valid, but consumer *code* is not automatically forward-compatible.

---

### Option B: Separate `propBindings` field *(Rejected)*

Add a sibling field on `Element` for bindings; leave `propConfigurations` scalar-only.

```yaml
nestedButton:
  propConfigurations:
    variant: primary
  propBindings:
    disabled: { $binding: "#/props/disabled" }
```

**Rejected because**:
- Two fields keyed by the same prop name invites collisions (`propConfigurations.disabled` and `propBindings.disabled`) with no obvious precedence rule.
- Inconsistent with `Element.content`, `Element.instanceOf`, and `Styles.visible`, which each carry the `scalar | PropBinding` union inline.
- Consumers must read and merge two fields to know "what is this prop set to?" — Option A keeps the answer in one place.

---

### Option C: String sentinel syntax *(Rejected)*

Encode bindings as magic strings, keeping the value union flat.

```yaml
propConfigurations:
  variant: primary
  disabled: "$binding:#/props/disabled"
```

**Rejected because**:
- Ambiguous with legitimate string values — a prop whose static value starts with `$binding:` is indistinguishable from a binding.
- Diverges from ADR-008. Every other binding site uses `{ $binding: string }`; a second encoding only for `propConfigurations` fractures the model.
- JSON Schema cannot validate the pointer payload of a sentinel string without a custom format; the object form gets `$ref: "#/definitions/PropBinding"` validation for free.

---

### Option D: Invert direction — declare forwarding on the parent prop *(Rejected)*

Express the pass-through relationship from the parent prop's side.

```ts
interface StringProp {
  type: 'string';
  forwardsTo?: string[];
}
```

**Rejected because**:
- Inverts natural locality. A reader inspecting `nestedButton` must scan every parent prop's `forwardsTo` list.
- Inconsistent with the existing `PropBinding` model on `content`, `instanceOf`, and `styles.visible` — all declared at the consumption site.
- A single parent prop forwarded to multiple targets becomes a list of pointers — harder to author and validate.

---

### Option E: Defer — treat as a consumer concern *(Rejected)*

Leave `PropConfigurations` scalar-only; document that consumers should infer pass-through by matching prop names.

**Rejected because**:
- Name-matching is a heuristic, not a contract. Two props can share a name without a forwarding relationship; a forwarding relationship can exist between differently-named props.
- The schema already commits to explicit bindings for `content`, `instanceOf`, and `styles.visible`. Leaving `propConfigurations` as the exception forces consumers to support two reasoning modes.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `PropConfigurations.ts` | Widen value union to include `PropBinding` and `SlotContentRef` | MINOR |

**Updated type** (`types/PropConfigurations.ts`):

```ts
import type { PropBinding } from './PropBinding.js';
import type { SlotContentRef } from './SlotContentRef.js';

type PropConfigurations = Record<string, string | number | boolean | PropBinding | SlotContentRef>;
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Update `#/definitions/PropConfigurations` `additionalProperties` to add `PropBinding` and `SlotContentRef` branches | MINOR |

**Updated definition** (`#/definitions/PropConfigurations`):

```yaml
# Before
PropConfigurations:
  type: object
  additionalProperties:
    oneOf:
      - type: string
      - type: number
      - type: boolean

# After
PropConfigurations:
  type: object
  additionalProperties:
    oneOf:
      - type: string
      - type: number
      - type: boolean
      - $ref: "#/definitions/PropBinding"
      - $ref: "#/definitions/SlotContentRef"
```

### Out of scope for this ADR

- **Slot prop pass-through via `PropBinding`** — forwarding a parent's slot prop to a nested instance's slot prop (`startVisual: { $binding: "#/props/mySlot" }`) is a distinct mechanism from filling a slot with content. The structural and semantic questions around slot prop forwarding are deferred to a follow-on ADR.
- **`InstanceExample.propConfigurations`** — accepts `string | number | boolean | SlotContentRef` per ADR-048; `PropBinding` is not accepted there by design.

### Notes

- **Discrimination.** `PropBinding` is discriminated by `$binding`; `SlotContentRef` by `$slotContent`; scalars by JSON primitive type. The `oneOf` branches are structurally unambiguous.
- **`PropBinding` path convention.** `{ $binding: "#/props/<name>" }` — same JSON Pointer convention used on `Element.content` and `Styles.visible` (ADR-008). Points at the parent component's prop, not at a nested instance's prop.
- **`SlotContentRef` path convention.** `{ $slotContent: "<JSON Pointer>" }` — same pointer and resolution rules as ADR-046. Points at a `SlotContent` or `Composition` entry. The path makes the registry scope explicit (`#/components/<name>/slotContentExamples/<key>` for component-scoped; `#/compositions/<key>` for system-scoped).
- **`InstanceExample` vs `Element`.** `InstanceExample.propConfigurations` (ADR-048) is documented configuration — `SlotContentRef` accepted, `PropBinding` not. `Element.propConfigurations` (this ADR) is the live element tree — both accepted.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**: `PropConfigurations` value union `string | number | boolean | PropBinding | SlotContentRef` ↔ `additionalProperties.oneOf` (five branches: three scalar, `$ref PropBinding`, `$ref SlotContentRef`)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-from-figma` | Must emit `PropBinding` values where a nested prop is bound to a parent prop; must emit `SlotContentRef` values where a nested slot prop is filled | Handle `PropBinding` and `SlotContentRef` branches when processing element prop configurations |
| `specs-cli` | Recompile; no output change until `specs-from-figma` emits the new value forms | Recompile |
| `specs-plugin-2` | Recompile | No change |

---

## Semver Decision

**Version bump**: `0.20.0 → 0.21.0` (`MINOR`)

**Justification**: The `PropConfigurations` value union is widened — no field is removed, renamed, or narrowed, and every previously-valid value (and already-emitted spec) stays valid. Widening is nonetheless **source-breaking** for consumers that narrowed the value type (see Cons): a strict reading of Constitution §III ("MAJOR for any breaking change to a type signature") points to MAJOR. The `MINOR` classification rests on the pre-1.0.0 convention (semver §4 — anything may change within `0.y.z`), under which this breaking change ships as the `0.20.0 → 0.21.0` bump; consumers must still update their value handling. *(Open for review: confirm `MINOR` under the pre-1.0 convention vs. `MAJOR` per a literal §III reading.)*

---

## Consequences

- `Element.propConfigurations` can express all three value forms in a single field: static scalar values, pass-through bindings to parent props, and slot fills via named content references
- The binding pattern established by ADR-008 (`PropBinding`) is now uniformly available across all element-level value fields: `content`, `instanceOf`, `styles.visible`, and `propConfigurations`
- `SlotContentRef` from ADR-046 is available at every `propConfigurations.<slotName>` call site — slot props are first-class prop values, not a separate authoring channel
- `InstanceExample.propConfigurations` (ADR-048) is not affected — it accepts `SlotContentRef` but not `PropBinding` by design; live bindings belong in the element tree, not in documented examples
- Slot prop pass-through (`PropBinding` on a slot prop) remains deferred; this ADR covers scalar prop forwarding and slot content fills only
