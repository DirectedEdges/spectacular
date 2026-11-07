# ADR: Consolidate Token Format Configuration into `tokens`

**Branch**: `007-token-reference-config`
**Created**: 2026-03-01
**Status**: ACCEPTED
**Summary**: A `format.tokens` option replaces `variables`, `simplifyVariables` and `simplifyStyles` with one token output format.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none — extends ADR 006: Unified Token Reference Type)*

---

## Context

`Config.format` currently carries three separate fields that together govern how resolved token references are serialized in output:

- `variables: 'NAME_WITH_COLLECTION' | 'NAME' | 'OBJECT'` — controls the naming shape of variable references
- `simplifyVariables: boolean` — whether variable reference objects are reduced to a name string
- `simplifyStyles: boolean` — whether style reference objects are reduced to a name string

```yaml
# Current shape — types/Config.ts → format object
variables: NAME_WITH_COLLECTION    # e.g. "DS Color/Text/Primary"
simplifyVariables: true            # emit name string instead of full VariableStyle object
simplifyStyles: true               # emit name string instead of full FigmaStyle object
```

These three fields interact implicitly: `variables` only applies when `simplifyVariables` is `false`, and `simplifyStyles` shares no coupling to `variables` at all. Consumers must read all three to determine the actual output shape, and many combinations are semantically undefined (e.g., `variables: 'OBJECT'` with `simplifyVariables: true`).

ADR 006 (`006-token-references`) is replacing `VariableStyle` and `FigmaStyle` with a single `TokenReference` type aligned to the W3C Design Tokens Community Group (DTCG) format. That change introduces a new output surface — the `TokenReference` object — with five meaningfully distinct serialization profiles:

1. Token object (`$token` path and `$type` — platform-neutral, no tool metadata)
2. Token name string (token path only, no wrapper object)
3. Token object with Figma extensions (`$token`, `$type`, plus `$extensions."com.figma"` metadata)
4. Figma name string (variable or style name in Figma-native slash-delimited format)
5. Custom (enterprise-defined projection, transformer-owned)

Three boolean/enum fields cannot cleanly express five mutually exclusive profiles. A single discriminated enum replaces the implicit interaction surface with a single explicit configuration axis.

---

## Decision Drivers

- **Type–schema sync**: Removing `variables`, `simplifyVariables`, and `simplifyStyles` and adding `tokens` requires symmetric changes in both `types/Config.ts` and `schema/component.schema.json` before publish (Constitution I).
- **No runtime logic**: This package declares shapes only. The `tokens` enum names the profile; the transformer applies it (Constitution II).
- **MAJOR for breaking changes**: Removing three required fields from `Config.format` breaks every consumer that constructs or pattern-matches a `Config` object. A MAJOR bump is required (Constitution III).
- **Minimal, intentional API surface**: Five named profiles are fewer moving parts than three interacting fields. The enum surface is smaller and produces no undefined cross-product (Constitution III).
- **Optionality over prescription**: `DEFAULT_CONFIG` exists to provide well-reasoned defaults for every field. A field with a documented default should be optional in the type — omitting it is equivalent to stating the default. Requiring fields whose absence has a clear meaning imposes unnecessary ceremony on callers. `tokens` should be optional; its absence means `TOKEN`. This raises a broader question — whether all `format` fields should be optional for the same reason — that is noted in Consequences but scoped out of this ADR.
- **DTCG alignment**: Output should be forward-compatible with the DTCG Candidate Recommendation. The `TOKEN` profile is a first-class option whose `$token` / `$type` shape follows DTCG conventions, not a post-processing concern.
- **Enterprise extensibility**: Enterprise consumers may require token output in bespoke formats (e.g., a proprietary token registry schema). The configuration surface must be able to signal "use an externally-supplied format", with the transformer responsible for its implementation. This package declares the signal only; no format logic is permitted here (Constitution II).
- **Stability of `DEFAULT_CONFIG`**: `tokens` defaults to `TOKEN` to align with ADR 006's direction.

---

## Options Considered

### Option A: Replace `variables`, `simplifyVariables`, `simplifyStyles` with a single optional `tokens` field, including `CUSTOM` *(Selected)*

Remove all three fields. Add `tokens?: 'TOKEN' | 'TOKEN_NAME' | 'TOKEN_FIGMA_EXTENSIONS' | 'FIGMA_NAME' | 'CUSTOM'` as an **optional** field in `Config.format`. The `CUSTOM` value is a reserved signal; its output projection is fully defined by the transformer receiving it. `DEFAULT_CONFIG` provides `'TOKEN'` as the default.

**Pros**:
- Eliminates the undefined cross-product (e.g., `variables: 'OBJECT'` + `simplifyVariables: true`)
- Single field is unambiguous — one read gives the full output contract
- Mirrors the five real output profiles introduced by `TokenReference` in ADR 006
- Making `tokens` optional reduces ceremony for callers; `DEFAULT_CONFIG` documents the intent
- Reduces `required[]` count in schema from 6 to 3 (net -3; `tokens` moves to optional)

**Cons / Trade-offs**:
- Breaking change: all consumers that set any of the removed fields must update (MAJOR bump required)
- Loses the historical `NAME` option (no-collection variable name); subsumed by `TOKEN_NAME`
- `CUSTOM` is open-ended by design; this package cannot validate that a transformer correctly implements it

---

### Option D: Allow `CUSTOM` as a fifth enum value for enterprise-defined output profiles *(Evaluated — included in Option A)*

An enterprise integrator may need to emit token references in a format that matches a proprietary token registry or build pipeline schema that is neither DTCG nor Figma-shaped. A fifth value `CUSTOM` in the `tokens` enum signals this intent to the transformer without requiring this package to define the format.

**How `CUSTOM` interacts with `TokenReference` (ADR 006)**:
`TokenReference` carries an open `$extensions` block (`additionalProperties: true`) as defined in ADR 006. The `$extensions` key is designed for reverse-domain-name namespaced tool metadata (e.g., `"com.figma"`, per DTCG §5.2.3). A custom format implementation in the transformer may:
- Populate a new `$extensions` namespace (e.g., `"com.enterprise.studio"`) and project the full `TokenReference` object through a custom mapping
- Emit the `$token` dot-path under a different key
- Collapse the reference to a bespoke scalar — treating `TokenReference` as an intermediate representation that the transformer projects into the enterprise shape

In all cases, `TokenReference` remains the canonical typed shape produced by the transformer's resolution stage. `CUSTOM` is purely a serialization profile instruction applied at the output stage. This separation preserves Constitution II: no logic ships in `types/`; the enum value is a pure declaration.

**Pros**:
- Explicit, enumerable signal — parseable by tooling, documentable, and visible in `anova-kit` config scaffolding
- Preserves `TokenReference` as the canonical intermediate; only the final projection is custom
- Open `$extensions` on `TokenReference` already provides the envelope for custom namespace metadata without a type change

**Cons / Trade-offs**:
- `CUSTOM` is a semantic placeholder: this package cannot validate correct transformer behavior for it
- Enterprises using `CUSTOM` implicitly depend on transformer-side configuration not tracked here; the config is incomplete without it

**Disposition**: Included in Option A. `CUSTOM` is a fifth enum value in the `tokens` field; Option A's enum is extended rather than treated as a separate decision branch.

---

### Option E: Limit the core `tokens` enum to platform-neutral profiles; treat `TOKEN_FIGMA_EXTENSIONS`/`FIGMA_NAME` as tool-specific extensions *(Rejected)*

The `anova` package is moving toward platform-independent output per ADR 006. One interpretation of that direction is that the core `tokens` enum should contain only platform-neutral values — `TOKEN`, `TOKEN_NAME`, `CUSTOM` — and that Figma-specific output formats should be handled as a tool extension outside this schema (e.g., declared in `anova-transformer`'s own config layer).

**Evaluation**:
`anova`'s primary intent is to be a source-of-truth independent of any design tool. It emerged from Figma conversion, but the schema exists to describe UI component structure as a stand-alone contract — a future or enterprise implementation that does not use Figma at all should be able to consume and produce valid `anova` output using only `TOKEN` profiles. Figma is not intrinsic to the schema; it is the current dominant source.

That said, `TOKEN_FIGMA_EXTENSIONS` and `FIGMA_NAME` are not in the enum because Figma is the source — they are there because Figma-native tooling is a real, durable consumer category. Consumers whose entire pipeline is Figma-native (e.g., passing output directly to a Figma REST API or a Figma plugin) have a legitimate need for a named, documented profile that emits token references in the shape those tools expect. That need does not disappear as anova matures toward platform independence; it represents a named output surface that exists alongside `TOKEN`, not instead of it.

The question for Option E is not "is Figma first-class to anova?" but "should named profiles for real consumer categories live in the shared config contract, or be delegated to CUSTOM?" Delegating them to `CUSTOM` would make `anova-kit` scaffolding unable to enumerate or describe these profiles without out-of-band transformer knowledge — fragmenting the config contract in a way that would affect every Figma-native consumer.

**Rejected because**:
- `TOKEN_FIGMA_EXTENSIONS`/`FIGMA_NAME` represent a real, named consumer category (Figma-native tooling) that warrants a first-class config value, regardless of whether Figma is the source tool
- Moving them into `CUSTOM` would fragment the config contract: `anova-kit` cannot scaffold or document `CUSTOM` profiles without out-of-band transformer knowledge, breaking the principle that `Config` is self-describing (Constitution I)
- The platform-independent intent of anova is served by `TOKEN` being the default and the canonical path forward; Figma profiles are an additive, named escape for Figma-native consumers — not a constraint on anova's independence

---

### Option B: Keep existing three fields, add `tokens` as an additional optional field *(Rejected)*

Retain `variables`, `simplifyVariables`, `simplifyStyles` alongside a new optional `tokens` hint.

**Rejected because**: Two overlapping configuration axes for the same concern violates the minimal-API principle (Constitution III). Consumers would face an ambiguous precedence question when both old and new fields are present. The undefined cross-product is preserved, not resolved.

---

### Option C: Remove only the `simplifyVariables` / `simplifyStyles` booleans, extend `variables` enum *(Rejected)*

Keep `variables` and extend its enum to include `TOKEN`, `TOKEN_NAME`, `TOKEN_FIGMA_EXTENSIONS`, `FIGMA_NAME`. Drop the two boolean flags.

**Rejected because**: The field name `variables` implies it only configures variable references. Style references (`FigmaStyle` / `TokenReference` from named styles) are a distinct surface governed by the same profile decision. A field named `variables` owning both is a misleading public API (Constitution III).

---

## Decision

Remove `variables`, `simplifyVariables`, and `simplifyStyles` from `Config.format`. Add an optional `tokens` field with `DEFAULT_CONFIG` providing `'TOKEN'`.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Config.ts` | Removed field `format.variables` | MAJOR |
| `Config.ts` | Removed field `format.simplifyVariables` | MAJOR |
| `Config.ts` | Removed field `format.simplifyStyles` | MAJOR |
| `Config.ts` | Added optional field `format.tokens?: 'TOKEN' \| 'TOKEN_NAME' \| 'TOKEN_FIGMA_EXTENSIONS' \| 'FIGMA_NAME' \| 'CUSTOM'` | MINOR |
| `Config.ts` | Updated `DEFAULT_CONFIG.format.tokens` to `'TOKEN'` | MINOR |

**Example — new shape** (`types/Config.ts`):
```yaml
# Before
format:
  output: JSON | YAML
  keys: SAFE | CAMEL | SNAKE | KEBAB | PASCAL | TRAIN
  layout: LAYOUT | PARENT_CHILDREN | BOTH
  variables: NAME_WITH_COLLECTION | NAME | OBJECT   # removed
  simplifyVariables: boolean                         # removed
  simplifyStyles: boolean                            # removed

# After
format:
  output: JSON | YAML
  keys: SAFE | CAMEL | SNAKE | KEBAB | PASCAL | TRAIN
  layout: LAYOUT | PARENT_CHILDREN | BOTH
  tokens?: TOKEN | TOKEN_NAME | TOKEN_FIGMA_EXTENSIONS | FIGMA_NAME | CUSTOM   # optional; default TOKEN
```

**Profile semantics** (informational — transformer applies these):

| Value | Token reference output shape |
|-------|------------------------------|
| `TOKEN` | `TokenReference` object with `$token` (dot-delimited path) and `$type`. No tool-specific metadata. Figma slash separators (`/`) are transformed to periods (`.`) per DTCG §6.7.2. |
| `TOKEN_NAME` | Token path string only (the `$token` value without the wrapper object), dot-delimited per DTCG §6.7.2. Figma `"DS Color/Text/Primary"` → `"DS Color.Text.Primary"`. |
| `TOKEN_FIGMA_EXTENSIONS` | Same `TokenReference` object as `TOKEN`, plus `$extensions: { "com.figma": { id, name, collectionName?, rawValue? } }`. Preserves Figma extraction provenance for consumers that need source-tool traceability. |
| `FIGMA_NAME` | Figma variable or style name as a slash-delimited string in Figma-native format. Variables include collection: `"DS Color/Text/Primary"`. Named styles use their Figma name: `"Shadow/Medium"`. |
| `CUSTOM` | Defined entirely by the transformer; `TokenReference` is the canonical intermediate. Custom projection may populate a new `$extensions` namespace, remap `$token`, or collapse to an enterprise scalar. |

#### Output examples by profile and type

Each example shows how a token reference appears in the component spec output for representative property types. Inline composites (e.g., `Shadow`, `Typography`) contain leaf-level token references; composite-level references replace the entire inline object with a single reference.

**`TOKEN`** (default) — `{ $token, $type }`:
```yaml
# color — backgroundColor
backgroundColor:
  $token: "DS Color.Text.Primary"
  $type: color

# gradient — whole gradient referenced by named style
backgroundColor:
  $token: "DS Gradient.Brand.Hero"
  $type: gradient

# gradient stop color — leaf reference inside inline gradient
backgroundColor:
  type: LINEAR
  angle: 180
  stops:
    - position: 0
      color:
        $token: "DS Color.Brand.Start"
        $type: color
    - position: 1
      color:
        $token: "DS Color.Brand.End"
        $type: color

# shadow — composite reference (replaces entire Effects object)
effects:
  $token: "DS Effects.Shadow.Medium"
  $type: shadow

# shadow — leaf references inside inline Shadow
effects:
  shadows:
    - visible: true
      offsetX: 0
      offsetY:
        $token: "DS Number.Shadow.OffsetY"
        $type: number
      blur:
        $token: "DS Number.Shadow.Blur"
        $type: number
      spread: 0
      color:
        $token: "DS Color.Shadow.Default"
        $type: color

# typography — composite reference (replaces entire Typography object)
typography:
  $token: "DS Type.Body.Medium"
  $type: typography

# typography — leaf references inside inline Typography
typography:
  fontSize:
    $token: "DS Number.Font.Size.MD"
    $type: number
  lineHeight:
    $token: "DS Number.Line.Height.Normal"
    $type: number
  fontFamily: "Inter"
  fontStyle: 400
```

**`TOKEN_NAME`** — dot-delimited `$token` path string only:
```yaml
# color
backgroundColor: "DS Color.Text.Primary"

# gradient (composite)
backgroundColor: "DS Gradient.Brand.Hero"

# gradient stop color (leaf)
backgroundColor:
  type: LINEAR
  angle: 180
  stops:
    - position: 0
      color: "DS Color.Brand.Start"
    - position: 1
      color: "DS Color.Brand.End"

# shadow (composite)
effects: "DS Effects.Shadow.Medium"

# shadow (leaf)
effects:
  shadows:
    - visible: true
      offsetX: 0
      offsetY: "DS Number.Shadow.OffsetY"
      blur: "DS Number.Shadow.Blur"
      spread: 0
      color: "DS Color.Shadow.Default"

# typography (composite)
typography: "DS Type.Body.Medium"

# typography (leaf)
typography:
  fontSize: "DS Number.Font.Size.MD"
  lineHeight: "DS Number.Line.Height.Normal"
  fontFamily: "Inter"
  fontStyle: 400
```

**`TOKEN_FIGMA_EXTENSIONS`** — `{ $token, $type, $extensions }`:
```yaml
# color
backgroundColor:
  $token: "DS Color.Text.Primary"
  $type: color
  $extensions:
    com.figma:
      id: "VariableID:123:456"
      name: "Text/Primary"
      collectionName: "DS Color"

# gradient (composite — named style, no collectionName)
backgroundColor:
  $token: "DS Gradient.Brand.Hero"
  $type: gradient
  $extensions:
    com.figma:
      id: "S:abc123"
      name: "Brand/Hero"

# shadow (composite — named style)
effects:
  $token: "DS Effects.Shadow.Medium"
  $type: shadow
  $extensions:
    com.figma:
      id: "S:def456"
      name: "Shadow/Medium"

# shadow (leaf — variable reference with rawValue)
effects:
  shadows:
    - visible: true
      offsetX: 0
      offsetY:
        $token: "DS Number.Shadow.OffsetY"
        $type: number
        $extensions:
          com.figma:
            id: "VariableID:789:012"
            name: "Shadow/OffsetY"
            collectionName: "DS Number"
            rawValue: 4
      blur:
        $token: "DS Number.Shadow.Blur"
        $type: number
        $extensions:
          com.figma:
            id: "VariableID:789:013"
            name: "Shadow/Blur"
            collectionName: "DS Number"
            rawValue: 8
      spread: 0
      color:
        $token: "DS Color.Shadow.Default"
        $type: color
        $extensions:
          com.figma:
            id: "VariableID:123:789"
            name: "Shadow/Default"
            collectionName: "DS Color"

# typography (composite — named style)
typography:
  $token: "DS Type.Body.Medium"
  $type: typography
  $extensions:
    com.figma:
      id: "S:typ789"
      name: "Body/Medium"

# typography (leaf)
typography:
  fontSize:
    $token: "DS Number.Font.Size.MD"
    $type: number
    $extensions:
      com.figma:
        id: "VariableID:456:001"
        name: "Font/Size/MD"
        collectionName: "DS Number"
        rawValue: 16
  lineHeight:
    $token: "DS Number.Line.Height.Normal"
    $type: number
    $extensions:
      com.figma:
        id: "VariableID:456:002"
        name: "Line/Height/Normal"
        collectionName: "DS Number"
        rawValue: 1.5
  fontFamily: "Inter"
  fontStyle: 400
```

**`FIGMA_NAME`** — Figma-native slash-delimited name string:
```yaml
# color (variable — includes collection prefix)
backgroundColor: "DS Color/Text/Primary"

# gradient (named style — style name only)
backgroundColor: "Brand/Hero"

# gradient stop color (leaf variable)
backgroundColor:
  type: LINEAR
  angle: 180
  stops:
    - position: 0
      color: "DS Color/Brand/Start"
    - position: 1
      color: "DS Color/Brand/End"

# shadow (named style)
effects: "Shadow/Medium"

# shadow (leaf variables)
effects:
  shadows:
    - visible: true
      offsetX: 0
      offsetY: "DS Number/Shadow/OffsetY"
      blur: "DS Number/Shadow/Blur"
      spread: 0
      color: "DS Color/Shadow/Default"

# typography (named style)
typography: "Body/Medium"

# typography (leaf variables)
typography:
  fontSize: "DS Number/Font/Size/MD"
  lineHeight: "DS Number/Line/Height/Normal"
  fontFamily: "Inter"
  fontStyle: 400
```

**Updated `DEFAULT_CONFIG`** (`types/Config.ts`):
```yaml
# Before
format:
  output: JSON
  keys: SAFE
  layout: LAYOUT
  variables: NAME_WITH_COLLECTION
  simplifyVariables: true
  simplifyStyles: true

# After
format:
  output: JSON
  keys: SAFE
  layout: LAYOUT
  tokens: TOKEN
```

---

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Removed property `format.variables` from `#/definitions/Config/properties/format/properties` | MAJOR |
| `component.schema.json` | Removed property `format.simplifyVariables` from same | MAJOR |
| `component.schema.json` | Removed property `format.simplifyStyles` from same | MAJOR |
| `component.schema.json` | Added property `format.tokens` with enum `["TOKEN", "TOKEN_NAME", "TOKEN_FIGMA_EXTENSIONS", "FIGMA_NAME", "CUSTOM"]` and `default: "TOKEN"` | MINOR |
| `component.schema.json` | Updated `format.required[]` to `["output", "keys", "layout"]` — `tokens` is **not** required | MAJOR |
| `styles.schema.json` | Updated description referencing `simplifyVariables` / `simplifyStyles` config fields | PATCH |

**Example — new shape** (`schema/component.schema.json`, `format` object):
```yaml
# Before — format.properties
variables:
  type: string
  enum: [NAME_WITH_COLLECTION, NAME, OBJECT]
simplifyVariables:
  type: boolean
simplifyStyles:
  type: boolean
# required: [output, keys, layout, variables, simplifyVariables, simplifyStyles]

# After — format.properties
tokens:
  type: string
  enum: [TOKEN, TOKEN_NAME, TOKEN_FIGMA_EXTENSIONS, FIGMA_NAME, CUSTOM]
  default: "TOKEN"
  description: "Token reference serialization profile. Optional; defaults to TOKEN. CUSTOM delegates projection entirely to the transformer."
# required: [output, keys, layout]   ← tokens omitted; it has a schema default
```

### Notes

- `TOKEN` is the default. `tokens` is optional; a config object that omits it is valid and behaves identically to `tokens: 'TOKEN'`. This is the first `format` field to be optional — the same rationale (each field has a well-defined default in `DEFAULT_CONFIG`) applies to `output`, `keys`, and `layout` as well, but making those optional is scoped out of this ADR.
- `TOKEN` and `TOKEN_NAME` are platform-neutral — they carry no Figma-specific metadata. `TOKEN_FIGMA_EXTENSIONS` adds Figma provenance (`$extensions."com.figma"`) for consumers that need source-tool traceability without abandoning the `TokenReference` shape.
- `FIGMA_NAME` emits the Figma-native slash-delimited name string. For variables this includes the collection prefix (e.g., `"DS Color/Text/Primary"`); for named styles it is the style name only (e.g., `"Body/Medium"`). This profile serves consumers whose downstream tooling is Figma-native.
- `FIGMA_NAME` and `TOKEN_FIGMA_EXTENSIONS` are not a statement that anova is Figma-dependent — anova's primary intent is a platform-independent source of truth, with `TOKEN` as the canonical default. Figma profiles are additive named escapes for Figma-native consumers that coexist with, and do not constrain, that independence.
- The prior `variables: 'NAME'` option (name without collection) has no direct `tokens` equivalent. It is subsumed by `TOKEN_NAME`. Consumers that relied on `'NAME'` must migrate.
- `CUSTOM` is a first-class enum member, not a string escape hatch. It is statically typed; the transformer branches on it explicitly. The `TokenReference` shape produced by ADR 006 is the intermediate representation in all cases — `CUSTOM` only affects how that representation is projected into final output. The open `$extensions` block on `TokenReference` (per ADR 006) provides the envelope for any new tool-namespace metadata a custom projection needs to attach.

### Schema scope: why the non-`TOKEN` profile shapes are not defined in `styles.schema.json`

`component.schema.json` defines `format.tokens` as a string enum — purely config input, not output shape. The output contract lives in `styles.schema.json`, and the profiles map to it as follows:

| Profile | Output shape | Schema coverage |
|---------|-------------|------------------|
| `TOKEN` | `TokenReference` object: `{ $token, $type }` | Covered by `#/definitions/TokenReference` (ADR 006) |
| `TOKEN_NAME` | Plain string: `"DS Color.Text.Primary"` | Covered by existing `string` arm in `Style`/`ColorStyle` `oneOf`; indistinguishable from a literal string — accepted |
| `TOKEN_FIGMA_EXTENSIONS` | `TokenReference` object with `$extensions."com.figma"` | Covered by `#/definitions/TokenReference` — `$extensions` is `additionalProperties: true` (ADR 006) |
| `FIGMA_NAME` | Plain string: `"DS Color/Text/Primary"` | Same as `TOKEN_NAME` — covered by `string` arm |
| `CUSTOM` | Transformer-defined | **Not schema-validated** by design |

**`TOKEN_NAME` / `FIGMA_NAME` and the `string` arm**: These profiles collapse `TokenReference` to a plain string. They already parse against the `string` arm of `Style`'s `oneOf`, so no additional schema work is required. The schema cannot distinguish a token path from a literal string value — this ambiguity is intentional and mirrors how the current `simplifyVariables: true` output behaves today.

**`TOKEN_FIGMA_EXTENSIONS` and `TokenReference`**: This profile emits the same `TokenReference` shape as `TOKEN`, with a populated `$extensions."com.figma"` block. Because `$extensions` is declared with `additionalProperties: true` in ADR 006, the Figma metadata passes schema validation without any new definitions. The `com.figma` namespace content (`id`, `name`, `collectionName?`, `rawValue?`) is not individually schema-validated — its shape is owned by the Figma API surface, not this package.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `Config.format.tokens?` (optional union string literal, five members) ↔ `format.properties.tokens` in `component.schema.json` (string enum with `default: "TOKEN"`, absent from `required[]`)
  - Removed `variables`, `simplifyVariables`, `simplifyStyles` from both type and schema simultaneously
  - `styles.schema.json` description update is documentation-only (PATCH); no new output shape definitions are added — see Schema scope note above

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Breaking — `Config` type consumed by CLI `init` command and config parsing utilities | Replace `variables`, `simplifyVariables`, `simplifyStyles` config fields with `tokens` in CLI config reading, defaults, and any documentation |

---

## Semver Decision

**MAJOR** — Three required fields are removed from a published type and its corresponding schema. The addition of `tokens` as an optional field is additive (MINOR), but it does not offset the MAJOR character of the removals. Per Constitution III, removing named fields from a type is a breaking change regardless of whether new fields are added in the same commit. The version bump from `0.11.0` targets the next appropriate boundary; given the pre-1.0 position of the package and the bundling intent with `v0.11.0`, this change is expected to ship as part of the `0.11.0` breaking release bundle alongside ADR 006.

---

## Consequences

- `Config.format` drops from six required fields to three (`output`, `keys`, `layout`) — `tokens` is optional with a documented default.
- The undefined cross-product of `variables` × `simplifyVariables` × `simplifyStyles` is eliminated.
- Token reference output format is a single named concept in both code and documentation.
- `anova-transformer` can switch on one field (`format.tokens`) rather than branching across three.
- `anova-kit` CLI must update its config schema, default generation, and `init` scaffolding.
- Consumers using `variables: 'NAME'` (name without collection) have no direct equivalent and must evaluate `TOKEN_NAME` or `FIGMA_NAME` as the closest substitutes.
- `DEFAULT_CONFIG` changes from `simplifyVariables: true` + `simplifyStyles: true` + `variables: 'NAME_WITH_COLLECTION'` to `tokens: 'TOKEN'`.
- `CUSTOM` produces schema-unvalidated output by design — it is enterprise-owned. It does not warrant new definitions in `styles.schema.json`.
- `FIGMA_NAME` and `TOKEN_FIGMA_EXTENSIONS` are long-lived first-class profiles for Figma-native consumers. They are additive named escapes alongside `TOKEN` — not a constraint on anova's platform-independent intent.
- `CUSTOM` enables enterprise consumers to define bespoke token output formats in `anova-transformer` without forking this package's type contract. The `tokens` field signals the intent; `TokenReference` (ADR 006) is always the canonical intermediate shape the transformer receives before applying the custom projection.
- Making `tokens` optional exposes a design question about the remaining `format` fields (`output`, `keys`, `layout`): each also has a well-defined default in `DEFAULT_CONFIG` and is equally a candidate for optionality. That broader refactor is out of scope for this ADR and should be tracked as a follow-up MINOR change.
