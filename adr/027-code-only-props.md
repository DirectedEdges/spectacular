# ADR: Code-Only Props

**Branch**: `027-code-only-props`
**Created**: 2026-03-16
**Status**: ACCEPTED
**Summary**: A `codeOnlyPropsPattern` option and `FigmaCodeOnlySource` extension emit props that exist in code but not Figma.
**Decides**: props.$extensions
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*
**Depends on**: [026-platform-extensions](./026-platform-extensions.md) (`$extensions` pattern)

---

## Context

Design system teams use a technique called **"code-only props"** in Figma to include additional component properties that have no visual impact on styling. These props encode non-visual concerns — accessibility labels, semantic heading levels, min/max constraints, ARIA roles — directly within the Figma component asset.

The Figma convention works as follows:

1. A **container layer** named `Code only props` (or similar convention) is placed as a direct child of the component root
2. The container is effectively invisible: positioned at (0,0) with near-zero dimensions (0.01×0.01) and contents clipped
3. **Sub-layers** within the container correspond to individual properties:
   - **Text layers** bound to Figma text component properties → `string` or `number` props (e.g., "Accessibility label", "minRows")
   - **Nested instances** of simple single-variant components → `enum` props with variant options as enumerated values (e.g., a `Heading Level` component with variants `h1|h2|h3|h4|h5|h6`)
4. Each sub-layer's corresponding Figma component property appears in the Figma property panel but has no visual effect on the rendered component
5. **Nesting**: Code-only props can be nested inside container frames bound to boolean code-only props, forming a hierarchy:
   ```
   root
   └── Code only props (FRAME)
       ├── accessibilityLabel (TEXT)
       ├── hasA11yOverrides (BOOLEAN — exposed as component prop)
       └── A11y Overrides (FRAME — visibility bound to hasA11yOverrides)
           ├── ariaRole (TEXT)
           ├── hasLiveRegion (BOOLEAN)
           └── Live Region (FRAME — visibility bound to hasLiveRegion)
               └── ariaLive (INSTANCE — enum: "polite"|"assertive"|"off")
   ```
   In this pattern, the container frames are bound to boolean props — when the boolean is false, the container and all children within are hidden from the designer in the Figma property panel. This is a designer-facing organizational tool, but it creates a meaningful parent-child hierarchy that affects which props are contextually relevant

The current Anova schema has no mechanism to:
- **Exclude** the code-only container layer and its children from `anatomy` and `elements` (they would currently appear as regular structural elements)
- **Surface** code-only props in the `props` section with provenance metadata indicating they originate from this Figma convention
- **Annotate** how a code-only prop is implemented in Figma (container layer name, sub-layer name, whether the value comes from a text property or a nested instance variant)

Reference: [Code Only Props in Figma](https://nathanacurtis.substack.com/p/code-only-props-in-figma) by Nathan Curtis.

---

## Decision Drivers

- **Types ↔ schema symmetry (Constitution I)**: Any new fields must exist in both `types/` and `schema/`
- **No logic (Constitution II)**: Only type and schema changes — layer detection and prop extraction logic belongs in `anova-transformer`
- **Stable, intentional API (Constitution III)**: New types must represent genuine shared concepts, not internal implementation details of one package
- **Additive change preferred**: All new fields should be optional to keep this a MINOR bump
- **Alignment with ADR 026**: Platform-specific Figma metadata belongs under `$extensions["com.figma"]`, not as top-level properties
- **Extensibility**: The pattern must work for text-based props (string, number), enum props (via nested instances), and potential future code-only prop types

---

## Options Considered

### Option A: Annotate code-only props via `$extensions["com.figma"]` on each prop *(Selected)*

Code-only props are extracted by the transformer and placed in the `props` section like any other prop. The only distinction is Figma-specific provenance metadata under `$extensions["com.figma"]`, which records that the prop originated from a code-only container layer.

The code-only container layer and its children are **excluded from anatomy and elements** by the transformer — they carry no structural or styling information. The schema does not need a new mechanism for this; it is a processing concern.

A new optional `source` field under `com.figma` records how the prop was detected:

```yaml
# String prop from a text layer inside the code-only container
accessibilityLabel:
  type: string
  examples: ["Submit form"]
  $extensions:
    com.figma:
      type: TEXT
      source:
        kind: codeOnlyProp
        layer: "Accessibility label"

# Enum prop from a nested instance with variants
headingLevel:
  type: string
  default: "h2"
  enum: ["h1", "h2", "h3", "h4", "h5", "h6"]
  $extensions:
    com.figma:
      type: VARIANT
      source:
        kind: codeOnlyProp
        layer: "Heading Level"
        instanceOf: "Heading Level"

# Boolean code-only prop
hasA11yOverrides:
  type: boolean
  default: false
  $extensions:
    com.figma:
      type: BOOLEAN
      source:
        kind: codeOnlyProp
        layer: "hasA11yOverrides"
```

**Pros**:
- Code-only props appear in `props` exactly like any other prop — consumers that don't care about provenance see no difference
- Provenance metadata follows the `$extensions["com.figma"]` convention established by ADR 026
- The `source.kind: "codeOnlyProp"` discriminator lets consumers identify code-only props when needed (e.g., for documentation generation or developer tooling)
- No new top-level fields on `Component`, `Anatomy`, or `Element` — the container layer simply doesn't appear
**Cons / Trade-offs**:
- Consumers must look inside `$extensions["com.figma"].source` to distinguish code-only props from visually-derived props — there is no top-level signal
- The transformer must implement the layer detection and exclusion logic (expected — per Constitution II, logic belongs downstream)
- The root code-only container layer name is not stored in the spec — it is a processing convention. A tool generating Figma assets must know the convention independently (e.g., via config)

#### Deferred: Nested hierarchy via `parent` (deferred)

Code-only props can be nested inside container frames bound to boolean code-only props (see Context §5). For example, `ariaRole` might live inside a container frame whose visibility is bound to `hasA11yOverrides`:

```yaml
ariaRole:
  type: string
  $extensions:
    com.figma:
      type: TEXT
      source:
        kind: codeOnlyProp
        layer: "ariaRole"
        parent: "#/props/hasA11yOverrides"    # deferred — not in this ADR's schema
```

A `parent` field (a `#/props/...` JSON pointer to the gating boolean prop) would capture this hierarchy, enabling tools to reconstruct the nested container-frame tree for round-trip Figma asset generation. This is **excluded from the current decision** to keep the initial schema surface minimal. If nested code-only prop hierarchies prove common enough to warrant schema support, `parent` can be added as an optional field on `FigmaCodeOnlySource` in a follow-up ADR — the type is designed to accommodate it without breaking changes.

#### Invariant hierarchy across variants

This ADR assumes that the code-only prop layer tree does **not** change across variants. The nesting structure (which props are children of which boolean-gated containers) is fixed for all variants of a component. Boolean code-only prop *values* may change per variant via `configuration`, but the tree shape itself — which props exist and their `parent` relationships — is constant. If a future component violates this assumption (e.g., a variant adds or removes code-only props, or restructures the nesting), the model would need to be revisited to support per-variant `source` metadata. Until that case arises, a single static `parent` chain per prop is sufficient.

#### `string` only, no `number` type inferences

Figma's component property system has no native `number` type — numeric values like `minRows: 2` are stored as TEXT properties with string content. The schema models code-only props as they are declared in Figma: a TEXT property becomes a `string` prop. The transformer **should not** infer `type: "number"` from the format of a default value (e.g., `"2"` → number). This would introduce heuristic logic that could misclassify legitimate string values (e.g., zip codes, IDs). If a typed `number` prop is needed, that distinction belongs in a code-platform extension (e.g., `$extensions["com.reactjs"].type: "number"`) or in a future Figma feature that supports numeric component properties natively. The Anova spec faithfully represents what Figma provides.

#### `kind` discriminator alternatives

The `kind` literal identifies props extracted from the code-only container pattern. Four candidates were considered:

| `kind` value | Emphasizes | Assessment |
|---|---|---|
| `codeOnlyProp` | The Figma community term for this technique | **Selected.** Immediately recognizable to anyone familiar with the convention. Already scoped under `com.figma`, so the Figma-specificity is appropriate rather than redundant. |
| `nonVisual` | The prop has no visual impact | **Rejected.** Imprecise — code-only props *can* have visual consequences. A boolean code-only prop may gate visibility of other props, and an enum like `headingLevel` affects rendered semantics that tools may style differently. "Non-visual" describes the *Figma layer's appearance*, not the prop's semantic role. |
| `embedded` | The prop is embedded in a hidden container layer | **Rejected.** Too vague — doesn't communicate *what* is embedded or *why*. Could be confused with embedded content or inline elements. |
| `synthetic` | The prop is synthesized from layer convention rather than direct visual analysis | **Rejected.** Implies the prop is artificial or derived, when in fact it is an intentionally authored property — just one that uses a container-layer workaround because Figma lacks a native mechanism for non-visual props. |

---

### Option B: Add a `codeOnlyProps` section separate from `props` *(Rejected)*

Introduce a new top-level `codeOnlyProps` field on `Component` that holds these props separately from visually-derived props.

```yaml
props:
  size: { type: string, default: "md", enum: ["sm", "md", "lg"] }
codeOnlyProps:
  accessibilityLabel: { type: string }
  headingLevel: { type: string, default: "h2", enum: ["h1", "h2", "h3"] }
```

**Rejected because**:
- Splits the prop contract into two locations, forcing all consumers to merge `props` and `codeOnlyProps` to get the full prop surface
- From a code consumer's perspective, a prop is a prop regardless of whether it was derived from visual styling or a code-only container — the distinction is Figma-specific provenance, not a fundamental type difference
- Adds a new required concept to the `Component` type for what is fundamentally a source-platform annotation
- Violates Constitution III: the distinction between "visual prop" and "code-only prop" is a Figma implementation detail, not a shared concept

---

### Option C: Add an `excluded` or `virtual` flag on `AnatomyElement` *(Rejected)*

Keep the code-only container layer in anatomy but mark it with a flag like `virtual: true` or `excluded: true`.

```yaml
anatomy:
  codeOnlyProps:
    type: container
    virtual: true
```

**Rejected because**:
- The code-only container is not part of the component's structural anatomy — it exists solely as a Figma workaround to host non-visual props
- Including it in anatomy forces consumers to filter it out, adding complexity for no benefit
- The container's sub-layers (text layers, nested instances) are prop sources, not renderable elements — representing them as anatomy elements misrepresents the component structure
- The information about what container layer was used is better captured as provenance metadata on the extracted props themselves

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Props.ts` | Add `FigmaCodeOnlySource` type and extend `FigmaPropExtension` (from ADR 026) with optional `source` field | MINOR |
| `Config.ts` | Add optional `codeOnlyPropsPattern` to `Config.processing` | MINOR |

**Example — new shape** (`types/Props.ts`):
```yaml
# New type
FigmaCodeOnlySource:
  kind: "codeOnlyProp"            # literal discriminator
  layer: string                   # sub-layer name within the code-only container tree
  instanceOf?: string             # for enum props: the nested instance component name

# Extended FigmaPropExtension (from ADR 026)
# Before (ADR 026)
FigmaPropExtension:
  type?: string                   # BOOLEAN, TEXT, INSTANCE_SWAP, VARIANT

# After
FigmaPropExtension:
  type?: string
  source?: FigmaCodeOnlySource    # optional — present only for code-only props
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `FigmaCodeOnlySource` definition; extend `com.figma` prop extension with optional `source` property; add `codeOnlyPropsPattern` to `Config.processing` | MINOR |

**Example — new shape** (`component.schema.json`):
```yaml
# New definition
FigmaCodeOnlySource:
  type: object
  description: "Provenance metadata for props extracted from a Figma code-only container layer."
  properties:
    kind:
      type: string
      const: "codeOnlyProp"
      description: "Discriminator identifying this prop as originating from a code-only container"
    layer:
      type: string
      description: "Sub-layer name within the code-only container tree corresponding to this prop"
    instanceOf:
      type: string
      description: "For enum code-only props: the component name of the nested instance whose variants define the enum values"
  required: [kind, layer]
  additionalProperties: false

# Extended com.figma under each prop's $extensions
com.figma:
  type: object
  properties:
    type:
      type: string
      enum: [BOOLEAN, TEXT, INSTANCE_SWAP, VARIANT]
    source:
      $ref: "#/definitions/FigmaCodeOnlySource"
  additionalProperties: false
```

### Notes

- This ADR **depends on ADR 026** landing first, since it extends the `$extensions["com.figma"]` structure on props that ADR 026 introduces.
- The `kind: "codeOnlyProp"` literal discriminator allows future `source` kinds (e.g., if other non-visual prop extraction patterns emerge) without breaking existing consumers.
- **Root container name is not stored** — it is a processing convention (e.g., "Code only props"). The transformer detects it by naming pattern (configurable). A tool regenerating Figma assets must know this convention independently.
- **No number type inference**: Figma TEXT properties are always emitted as `type: "string"` props, even when the content looks numeric. Type narrowing (string → number) is a code-platform concern, not a Figma extraction concern.
- **Invariant tree assumption**: The code-only prop nesting structure is assumed to be constant across all variants of a component. Per-variant structural changes to the code-only tree are not modeled.
- A `processing.codeOnlyPropsPattern` field on `Config` lets users configure the container layer naming convention (e.g., `"Code only props"`). It follows the same optional pattern as `glyphNamePattern` — absence means no code-only prop extraction.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes — `FigmaCodeOnlySource` exists in both `types/Props.ts` and `component.schema.json`, and the `source` field on the Figma extension is mirrored in both artifacts.
- **Parity check**:
  - `FigmaCodeOnlySource` type (`kind`, `layer`, `instanceOf?`) ↔ `#/definitions/FigmaCodeOnlySource`
  - `FigmaPropExtension.source` ↔ `com.figma.properties.source` on all prop definitions

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `anova-kit` | Recompile | No usage changes — `source` on `$extensions["com.figma"]` is optional. Recompile against updated types. |

---

## Semver Decision

**Version bump**: `0.14.0` (`MINOR`)

**Justification**: All changes are additive optional fields and a new type definition. No existing fields are modified or removed. Per Constitution III, additive optional fields are a MINOR bump.

---

## Consequences

- Code-only props extracted from Figma appear in the `props` section alongside visually-derived props, providing a unified prop API surface for all consumers
- Each code-only prop carries Figma-specific provenance metadata (`source.kind`, `source.layer`, `source.instanceOf`) under `$extensions["com.figma"]`, enabling consumers to trace the prop back to its Figma layer structure
- The code-only container layer and its children are excluded from `anatomy` and `elements` — the transformer filters them during processing, keeping the structural representation clean
- The `kind: "codeOnlyProp"` discriminator on `source` is extensible to future non-visual prop extraction patterns
- Consumers that do not care about Figma provenance see code-only props as ordinary `string` or `enum` props — no special handling required
- The root code-only container layer name is not persisted in the spec — it is a processing convention. Tools regenerating Figma assets must know this convention from configuration
- Nested code-only prop hierarchies (boolean-gated container frames) are recognized in Context but **not modeled** in this version of the schema. A `parent` field can be added to `FigmaCodeOnlySource` in a follow-up ADR if needed
