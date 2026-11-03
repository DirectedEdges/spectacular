# ADR: Conditional Visible Binding

**Branch**: `018-conditional-visible-binding`
**Created**: 2026-03-10
**Status**: ACCEPTED
**Summary**: A `Conditional` type with condition expressions lets `visible` test a prop value rather than mirror it.
**Decides**: styles.visible
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

Currently, `visible` on `Styles` accepts `Style` which includes `PropBinding`. When `visible` is bound to a boolean prop, the relationship is direct: the prop value *is* the visibility value. However, a common Figma pattern uses **nullable string props** (text or glyph content) to control visibility — the element is visible when the prop has a value and hidden when the prop is `null`.

Today's `PropBinding` (`{ $binding: "#/props/label" }`) can only express "use this prop's value directly." It cannot express "derive visibility from whether this prop is null or not." This means:

- A `TextProp` or `GlyphProp` with `nullable: true` implies visibility semantics, but the `visible` style has no way to declare this relationship in the spec output
- Consumers must infer the null-to-visibility mapping from convention rather than from the spec contract
- There is no general-purpose mechanism for declarative conditions on style values

This ADR introduces a **conditional expression** type that can be used anywhere a `Style` value appears, starting with the `visible` use case.

---

## Decision Drivers

- **Declarative over implicit**: The spec output should explicitly declare derived relationships rather than requiring consumers to infer them from convention
- **Types and schema symmetry**: Any new type must have a corresponding schema definition (Constitution I)
- **No runtime logic**: The expression type is a data structure describing a condition — not executable code (Constitution II)
- **Additive change**: New optional types avoid breaking existing consumers (Constitution III, semver MINOR)
- **General-purpose**: The mechanism should be reusable for future conditional bindings beyond `visible`, without over-engineering for hypothetical cases now

---

## Options Considered

### Option A: `$condition` on `PropBinding` (flat, no `then`/`else`) *(Rejected)*

Introduce a `ConditionalBinding` type that pairs a `$binding` reference with a declarative `$condition` object. The condition uses an operation field from a fixed set and an `args` array.

```yaml
# visible bound to "show when label is not null"
visible:
  $binding: "#/props/label"
  $condition:
    op: "isNotNull"

# visible bound to "show when icon equals 'check'"
visible:
  $binding: "#/props/icon"
  $condition:
    op: "equals"
    args: ["check"]
```

**Rejected because**: No `then`/`else` — the output values are implied rather than explicit. The condition result must be interpreted as the style value directly, which limits flexibility (e.g., cannot map `isNull` → `false` without convention). Also mixes `$binding` at the top level with condition semantics, making it harder to distinguish from a plain `PropBinding`.

---

### Option B: `if` / named-operation condition / `then` / `else` *(Rejected)*

Wrap the conditional in an `if` block where the `condition` uses a **named operation key** (e.g. `isNull`) whose value is the binding reference. `then` and `else` provide explicit output values.

```yaml
# "visible when label is not null"
visible:
  if:
    condition:
      isNull:
        $binding: "#/props/label"
    then: false
    else: true

# "visible when icon equals 'check'"
visible:
  if:
    condition:
      equals:
        $binding: "#/props/icon"
        value: "check"
    then: true
    else: false
```

**Rejected because**: The condition object uses a dynamic key as the operation name, making JSON Schema validation difficult — `additionalProperties: false` cannot coexist with variable property names, requiring `patternProperties` or per-operation sub-schemas. Each operation also has its own argument shape (unary `isNull` takes just `$binding`; binary `equals` adds `value`), further complicating validation. Option C achieves the same `if`/`then`/`else` readability with a uniform, easily-validated structure.

---

### Option C: `if` / `operation` + `args` condition / `then` / `else` *(Selected)*

Same `if`/`then`/`else` wrapper, but the condition uses an explicit `operation` field and an `args` object where the binding is a named argument.

```yaml
# "visible when label is not null"
visible:
  if:
    condition:
      operation: "isNotNull"
      args:
        value:
          $binding: "#/props/label"
    then: true
    else: false

# "visible when icon equals 'check'"
visible:
  if:
    condition:
      operation: "equals"
      args:
        value:
          $binding: "#/props/icon"
        compareTo: "check"
    then: true
    else: false
```

**Pros**:
- `then`/`else` make output values explicit — no implied mapping from condition result to style value
- Uniform `condition` shape: every operation has the same `operation` + `args` structure — easy to validate with a single schema definition and `additionalProperties: false`
- `args` as a named object (not positional array) is self-documenting
- `$binding` nested inside `args.value` clearly separates "what to test" from "the operation"
- Fewer new types than Option A: the `if` wrapper is a single `ConditionalStyle` type, no need for a separate `ConditionalBinding` that overlaps with `PropBinding`

**Cons / Trade-offs**:
- More verbose than Option B for simple cases (`operation` + `args.value.$binding` vs just `isNull.$binding`)
- `args` keys vary per operation (`value` only vs `value` + `compareTo`), so consumers still need per-operation handling

---

### Option D: Syntax-based expression string *(Rejected)*

Encode the condition as a structured string value:

```yaml
visible: "if { isNotNull(#/props/label) / true / false }"
```

**Rejected because**: String-encoded expressions require parsing, violate the principle of machine-readable structured data, and make schema validation difficult. Consumers cannot validate or process without a custom parser, which pushes runtime logic concerns into the spec contract.

---

### Option E: Separate `not:` modifier with enum matching *(Rejected)*

Add a `not:` wrapper around a binding with an enum of values to negate:

```yaml
visible:
  not:
    $binding: "#/props/label"
    values: [null]
```

**Rejected because**: The `not:` + `values` pattern is limited to negation of specific values. It cannot generalize to other operations (`equals`, `greaterThan`, etc.) without redesigning the structure. This creates a bespoke pattern for one use case rather than a general conditional mechanism.

---

### Option F: `$expression` evaluator *(Rejected)*

Introduce a freeform `$expression` field with a mini-language:

```yaml
visible:
  $expression: "props.label != null"
```

**Rejected because**: Freeform expressions require an interpreter or evaluator, which is runtime logic. This violates Constitution II and places an unbounded implementation burden on all consumers.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Conditional.ts` | New file: `Conditional`, `ConditionExpression`, `ConditionArgs` | MINOR |
| `Styles.ts` | Update `Style` union to include `Conditional` | MINOR |
| `index.ts` | Export `Conditional`, `ConditionExpression`, `ConditionArgs` | MINOR |

**Example — new types** (`types/Conditional.ts`):
```yaml
ConditionArgs:
  value: PropBinding                              # the binding to test
  compareTo?: string | number | boolean | null    # operand for binary operations

ConditionExpression:
  operation: string            # operation name (e.g. "isNull", "equals")
  args: ConditionArgs

Conditional:
  if:
    condition: ConditionExpression
    then: string | boolean | number | null
    else: string | boolean | number | null
```

**Example — updated `Style` union** (`types/Styles.ts`):
```yaml
# Before
Style: string | boolean | number | null | TokenReference | PropBinding

# After
Style: string | boolean | number | null | TokenReference | PropBinding | Conditional
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `Conditional`, `ConditionExpression`, `ConditionArgs` definitions | MINOR |
| `styles.schema.json` | Add `Conditional`, `ConditionExpression`, `ConditionArgs` definitions; update `BooleanBindableStyleValue` to include `Conditional` ref | MINOR |

**Example — new definitions** (`schema/styles.schema.json`):
```yaml
# Under #/definitions
ConditionArgs:
  type: object
  properties:
    value:
      $ref: "#/definitions/PropBinding"
      description: "The prop binding whose value is tested"
    compareTo:
      oneOf:
        - { type: string }
        - { type: number }
        - { type: boolean }
        - { type: "null" }
      description: "Comparison operand for binary operations (equals, notEquals). Omitted for unary operations."
  required: ["value"]
  additionalProperties: false

ConditionExpression:
  type: object
  properties:
    operation:
      type: string
      description: "Predicate operation name (e.g. 'isNull', 'isNotNull', 'equals', 'notEquals')"
    args:
      $ref: "#/definitions/ConditionArgs"
  required: ["operation", "args"]
  additionalProperties: false

Conditional:
  type: object
  description: "A conditional binding. Evaluates the condition against a bound prop and resolves to the then or else branch."
  properties:
    if:
      type: object
      properties:
        condition:
          $ref: "#/definitions/ConditionExpression"
        then:
          description: "Value when condition is true"
          oneOf: [string, boolean, number, null]
        else:
          description: "Value when condition is false"
          oneOf: [string, boolean, number, null]
      required: ["condition", "then", "else"]
      additionalProperties: false
  required: ["if"]
  additionalProperties: false
```

### Notes

- `Conditional` is discriminated from other `Style` members by the required `if` key — no collision with `PropBinding` (`$binding`), `TokenReference` (`$token`), or primitives.
- `ConditionArgs.value` is always a `PropBinding` — the binding is the subject of the condition, not the condition itself.
- `compareTo` is optional: unary operations (`isNull`, `isNotNull`) ignore it; binary operations (`equals`, `notEquals`) require it. Schema validation enforces `value` is always present.
- `then` and `else` are both required, making the output explicit for every condition — no implicit default values.
- `ConditionExpression.operation` is typed as `string` (not a literal union) so that consumers and future extensions can introduce custom operations without a type or schema change. Built-in operations include `isNull`, `isNotNull`, `equals`, `notEquals`.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `Conditional` type ↔ `#/definitions/Conditional` schema
  - `ConditionExpression` type ↔ `#/definitions/ConditionExpression` schema
  - `ConditionArgs` type ↔ `#/definitions/ConditionArgs` schema
  - Updated `Style` union ↔ updated `BooleanBindableStyleValue` and style value `oneOf` entries

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | New `Conditional` shape may appear in `visible` (and potentially other style values) | Update type imports; handle `Conditional` discriminant (check for `if` key) when processing style values |

---

## Semver Decision

**Version bump**: `0.13.0` → `0.13.0` (no version change — this is part of the current MINOR release cycle)

**Justification**: All changes are additive: new optional types and new schema definitions. No existing fields are removed, renamed, or have changed semantics. This is a MINOR change per Constitution III, included in the current `0.13.0` release.

---

## Consequences

- Consumers can now express "this element's visibility depends on whether prop X is null" as a first-class spec declaration rather than an implicit convention
- The `if`/`condition`/`then`/`else` pattern establishes a general-purpose conditional mechanism that can be extended beyond `visible` in future ADRs
- All consumers must handle the new `Conditional` discriminant (check for `if` key) alongside `PropBinding` and primitives when processing style values
- `ConditionExpression.operation` is an open `string` — consumers can define custom operations without schema changes; built-in operations (`isNull`, `isNotNull`, `equals`, `notEquals`) are documented by convention
- `then` and `else` are always explicit — no ambiguity about what value resolves in either branch
