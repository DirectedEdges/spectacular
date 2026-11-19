# ADR: Foundation injection — icon references, and config-declared custom foundation sources

**Branch**: `127-foundation-injection`
**Created**: 2026-11-19
**Status**: DRAFT
**Summary**: *(written at implementation — see `/specs.adr.implement`)*
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*

---

## Context

A spec refers to a design system's foundations by name, and each kind of foundation carries a different amount of that name's meaning in the spec itself.

**Tokens carry a structured reference.** `TokenReference` gives every token-bound value a `$token` path and a `$type`, and `spec.tokens` chooses among eight serialization profiles for it. One of those profiles, `CUSTOM`, emits an object a team supplied verbatim — so a team whose token system spells a reference `{ name: "color-text-primary", value: "{color.text.primary}" }` can have the spec say exactly that.

**Images carry a registry pointer.** `Component.images` is a registry of `ImageData` entries, each with an optional resolved `src`, and `ImageValue.$image` points into it (ADR-063, 0.28.0). The resolved location of the asset is recorded once per distinct image rather than at every use.

**Icons carry a bare string and nothing else.** A glyph element's content is the glyph's name:

```yaml
elements:
  icon:
    content: attach
```

`Element.content` is typed `string | PropBinding`. There is no registry, no resolved value, and no profile. The name resolves only against `cache/icons.yaml`, which is a generated lookup table inside the workspace — so a consumer reading the published spec has no way to find the asset the name refers to. Teams asking for

```yaml
elements:
  icon:
    content:
      name: attach
      value: https://cdn.example.com/icons/svg/attach.svg
```

are asking for the thing `TokenReference` already gives tokens and `ImageValue` already gives images.

**The injection mechanism is a separate command, and it covers tokens only.** `applyCustomTokens` takes one JSON mapping file on the command line, writes a `$custom` object onto matching entries in the fetched Figma payloads, and rebuilds the cache. It sits between `fetch` and `generate` as a step a person has to remember, it accepts exactly one file, and it has no notion of a concern other than tokens. A workspace that re-fetches has silently lost its injections until the command is run again.

Two gaps, then: icons have no reference shape to inject *into*, and the injection itself is a command-time argument rather than a declared property of the workspace.

**Out of scope.** The name and surface of the CLI command — whether `applyCustomTokens` is removed, aliased, or kept as a manual re-run of what `fetch` now does automatically — is a `specs-cli` decision, not a schema one. This ADR declares the settings that make the behaviour automatic; the CLI decides what remains invocable.

---

## Decision Drivers

- **Symmetry across foundation kinds**: a spec reader should resolve an icon the same way they resolve an image. Three different answers to "where does the resolved value live" is three things to learn.
- **The spec must carry what a consumer needs to resolve it**: a reference whose target is only findable in a generated workspace cache is not a reference in the published contract.
- **Repetition is a cost paid per occurrence**: a glyph name recurs at every element site across every variant. Whatever shape is chosen is written dozens of times per component.
- **Type and schema parity**: every type added has a schema counterpart and every named schema definition has a type (Constitution I).
- **No runtime logic in this package** (Constitution II): the schema declares what the settings are; resolution, merging, and file reading belong downstream.
- **No single consumer's model steers the contract** (Constitution III): one team's `{ name, value }` token spelling is an instance of the custom-shape escape hatch, not a schema-level reference form.
- **Additive where possible**: downstream packages recompile against this on every release; a breaking union change costs all seven of them at once.
- **Dual runtime**: the plugin runtime has no filesystem, so anything declared as a local file path is readable in the CLI runtime only.

---

## Options Considered — §1: Where a resolved icon value lives

### Option A: Registry on `Component`, pointer at the element *(Selected)*

`Component` gains an `icons` registry mirroring `images`, and `Element.content` admits a pointer object.

```yaml
# Component-level registry
icons:
  attach:
    src: https://cdn.example.com/icons/svg/attach.svg

# Element reference
elements:
  icon:
    content:
      $icon: attach
```

**Pros**:
- Identical in shape and resolution grammar to the ratified `Images` model, so one mental model covers both — satisfies the symmetry driver.
- The resolved `src` is written once per distinct icon rather than once per element site, which matters because a glyph name recurs across every variant.
- `src` absent is a meaningful, already-established state: the name is known, the asset is not resolved. Matches `ImageData`'s two-phase detect-then-resolve shape.
- The published spec carries the resolution, so no consumer depends on `cache/icons.yaml`.

**Cons / Trade-offs**:
- A reader follows a pointer rather than reading the value in place.
- Split-concern specs need the spec-key pointer grammar (`"#/components/<key>/icons/<name>"`), the same cost `$image` and `$slotContent` already pay.

---

### Option B: Inline object at every reference *(Rejected)*

`Element.content` admits `{ name, value }` directly, with no registry.

**Rejected because**: it violates the repetition driver outright — the resolved URL becomes the dominant text of a multi-variant component spec, and a CDN path change edits every occurrence. It also takes one team's token spelling (`name`/`value`) as the schema's reference vocabulary, which Constitution III forbids. That spelling is available, unchanged, through §3's custom profile.

---

### Option C: Keep the bare string; resolve at transform time *(Rejected)*

Leave `Element.content` as it is and have each transform resolve the glyph name against `cache/icons.yaml`.

**Rejected because**: the resolution never reaches the published spec, so it fails the "spec must carry what a consumer needs" driver. It also makes every consumer reimplement the lookup, and makes a generated workspace cache a de facto part of the published contract.

---

## Options Considered — §2: Vocabulary for the registry

### Option A: `icons` / `IconValue.$icon` *(Selected)*

The registry is `Component.icons`, its entries are `IconData`, and the pointer is `IconValue.$icon`.

**Pros**:
- `$glyph` is already a `PrimitiveSlotContent` value (`'$text' | '$glyph'`), so reusing it as a pointer key puts one spelling on two unrelated concepts.
- "Icon" is the term every code platform uses for the consumed artifact — React `<Icon name="attach" />`, SwiftUI `Image(systemName:)` / asset catalogues, Compose `Icon(painter)`. Constitution VI rule 1 applies: two or more code platforms agree.
- The workspace already says "icon" where it names the asset: `fetch: ['icons']`, `cache/icons.yaml`, `settings.assets`.

**Cons / Trade-offs**:
- The schema keeps both words. `glyph` continues to name the Figma-side *element type* and the `conventions.glyphs` detection block; `icon` names the consumable asset and its registry. The split is real but it needs stating, or the next author will unify them in the wrong direction.

---

### Option B: `glyphs` / `$glyph` *(Rejected)*

**Rejected because**: it collides with the existing `'$glyph'` slot-content literal, and it takes the Figma-side word for a consumer-facing registry — Constitution VI rule 3's condition (no code platform has a strong opinion) is not met, since every code platform says "icon".

---

## Options Considered — §3: Reach of the custom verbatim shape

### Option A: A serialization profile per concern *(Selected)*

`spec.tokens` gains two siblings, `spec.icons` and `spec.images`, each a profile enum with its own `CUSTOM` member. A concern set to `CUSTOM` emits the team-supplied object verbatim in place of the schema's own reference form, falling back to the default profile where no custom object was supplied.

```yaml
spec:
  tokens: CUSTOM
  icons: CUSTOM
  images: REGISTRY    # unchanged behaviour
```

**Pros**:
- Each concern is elected independently; a team with a custom icon pipeline and stock tokens is expressible.
- Extends an already-ratified mechanism rather than inventing a second one, so `CUSTOM` means the same thing in three places.
- The verbatim object stays an explicitly elected escape hatch, so the default contract remains fully typed.

**Cons / Trade-offs**:
- Three settings where there was one, and each needs its own documented fallback.
- A `CUSTOM` spec is unvalidatable in that concern by construction. This is already true of `spec.tokens: CUSTOM` and is the price of the mechanism, not a new cost.

---

### Option B: One global `spec.custom: true` switch *(Rejected)*

**Rejected because**: it makes custom-versus-stock an all-or-nothing property of the workspace. A team adopting custom icon references would be forced to abandon stock token references at the same time, and the existing `spec.tokens: CUSTOM` value would have to be removed — a breaking change buying nothing.

---

### Option C: Infer `CUSTOM` from the presence of a mapping file *(Rejected)*

**Rejected because**: declaring a source would silently change the shape of the output. A team adding one icon mapping to inspect it would find its token references reshaped. Electing a serialization profile and declaring where data comes from are two statements, and collapsing them removes the ability to make either one alone.

---

## Options Considered — §4: Where foundation sources are declared

### Option A: A `foundations` block under `data`, keyed by concern *(Selected)*

`Settings.data` gains `foundations`, holding an ordered list of local file paths per concern. `fetch` and `cache` read them as part of their normal run.

```yaml
data:
  directory: .specs
  sources:
    library:
      key: abc123
      fetch: [file, variables, styles, icons]
  foundations:
    tokens:
      - foundations/color.tokens.json
      - foundations/dimension.tokens.json
    icons:
      - foundations/icons.json
    images:
      - foundations/images.json
```

**Pros**:
- Injection becomes a property of the workspace rather than a step someone remembers, so a re-fetch cannot silently drop it.
- Multiple paths per concern, which is what a team with per-concern token files already has on disk.
- Sits under `data` because it is source acquisition — the same concern that owns `sources` and `directory`.
- Declaration order is the contract: later files win on a key collision. One rule, stated once, no per-concern exceptions.

**Cons / Trade-offs**:
- Local paths are unreadable in the plugin runtime, so a workspace using `foundations` produces different output under the plugin than under the CLI. Stated in Consequences; the schema cannot resolve it.
- Paths are relative to the config directory, which the schema declares but cannot enforce.

---

### Option B: Per-source `foundations`, nested inside each `SourceEntry` *(Rejected)*

**Rejected because**: a custom token mapping describes the *team's* system, not one Figma file. A workspace reading three Figma sources would duplicate the same mapping three times, and a key present in two copies would have no defined winner.

---

### Option C: Keep it a command argument *(Rejected)*

Leave injection as `applyCustomTokens <mapping>`, extended with `--icons` and `--images` flags.

**Rejected because**: it preserves the failure the request names — a step outside the declared workspace, lost on every re-fetch. Flags also cannot express "these four files, in this order" without inventing repeatable-flag ordering semantics that config already has for free.

---

## Options Considered — §5: Where the mapping-file contract lives

### Option A: A typed `FoundationMapping` with its own schema file *(Selected)*

The mapping file shape becomes a declared contract — `FoundationMapping` in `types/`, with `foundations.schema.json` in `schema/` — alongside `Settings` and `Conventions`, the other authored inputs this package already declares.

**Pros**:
- `data.foundations` names files the schema otherwise says nothing about, which would leave a declared setting pointing at an undeclared format.
- A mapping file becomes validatable before a fetch consumes it, rather than failing partway through one.
- Puts all three authored inputs — settings, conventions, foundations — on the same footing.

**Cons / Trade-offs**:
- Constitution III states that adding a schema file is a breaking change. The clause guards against *restructuring* what consumers already resolve; an added file removes and renames nothing, and `guidelines.schema.json` and `supplemental.schema.json` were both added as MINOR-class on the same reading. Recorded here as a deliberate application of that reading, not an oversight.

---

### Option B: A definition inside `settings.schema.json` *(Rejected)*

**Rejected because**: a mapping file is its own document, and a document validated by `$ref`-ing into another document's `definitions` has no root schema of its own. It would also make the settings schema the home of a shape that is not a setting.

---

### Option C: Leave the format undeclared, as it is today *(Rejected)*

**Rejected because**: `data.foundations` would then be a typed setting whose value is a path to an untyped file — the schema stating that something exists while declining to say what it is.

---

## Decision

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Icon.ts` | Added — new file declaring `IconValue`, `IconData`, `Icons`, `FigmaIconExtension`, `IconDataExtensions` | MINOR |
| `Element.ts` | Widened `content` union to admit `IconValue` | MINOR |
| `Component.ts` | Added optional `icons?: Icons` | MINOR |
| `Settings.ts` | Added optional `data.foundations?: FoundationSources`; added optional `spec.icons` and `spec.images` profile enums; added `FoundationSources` interface | MINOR |
| `Foundations.ts` | Added — new file declaring `FoundationMapping` and `FoundationEntry` | MINOR |
| `index.ts` | Added exports for every type above | MINOR |

**Example — the icon registry and its reference** (`types/Icon.ts`, `types/Element.ts`):

```yaml
# Before
Element:
  content?: string | PropBinding

# After
Element:
  content?: string | IconValue | PropBinding

IconValue:
  $icon: string          # pointer into an icons registry
IconData:
  src?: string           # resolved asset location; absent = unresolved
  $extensions?: IconDataExtensions
Icons: Record<string, IconData>
```

**Example — spec output before and after** (`spec.icons: REGISTRY`):

```yaml
# Before
elements:
  icon:
    content: attach

# After
icons:
  attach:
    src: https://cdn.example.com/icons/svg/attach.svg
elements:
  icon:
    content:
      $icon: attach
```

**Example — spec output under `spec.icons: CUSTOM`**, where the team's mapping supplied `{ name, value }`:

```yaml
elements:
  icon:
    content:
      name: attach
      value: https://cdn.example.com/icons/svg/attach.svg
```

**Example — new settings members** (`types/Settings.ts`):

```yaml
FoundationSources:
  tokens?: string[]      # ordered; later file wins on a key collision
  icons?: string[]
  images?: string[]

Settings:
  data:
    foundations?: FoundationSources
  spec:
    icons?: 'REGISTRY' | 'NAME' | 'CUSTOM'
    images?: 'REGISTRY' | 'CUSTOM'
```

**Example — the mapping-file contract** (`types/Foundations.ts`):

```yaml
FoundationEntry:
  $custom: Record<string, unknown>   # emitted verbatim; contents not validated
FoundationMapping: Record<string, FoundationEntry>
```

The key is the foundation's identity in the fetched data: a `VariableID:*` id or published style node id for `tokens`, a glyph name for `icons`, a content hash for `images`.

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Added `#/definitions/IconValue`, `IconData`, `Icons`; added `icons` under `#/definitions/Component/properties`; widened `#/definitions/Element/properties/content` | MINOR |
| `settings.schema.json` | Added `#/definitions/FoundationSources`; added `foundations` under `data`; added `icons` and `images` under `spec` | MINOR |
| `foundations.schema.json` | Added — new file; root schema for a foundation mapping file | MINOR |
| `package.json` | Added `exports` entry for `./schema/foundations.schema.json` | MINOR |

**Example — new property under `#/definitions/Element/properties`**:

```yaml
content:
  anyOf:
    - type: string
    - $ref: "#/definitions/IconValue"
    - $ref: "#/definitions/PropBinding"
  description: "The content for content-bearing elements."
```

### Notes

- `icons` is optional on `Component` for the same reason `images` is: a component with no glyph element has no registry.
- `IconData.src` is optional, so a detect-then-resolve run is expressible — the same two-phase shape `ImageData` uses, and the state a workspace is in before any foundation source has been read.
- `FoundationEntry.$custom` is typed `Record<string, unknown>` rather than `any`. The contents are deliberately unvalidated; the container is not.
- The `glyph` / `icon` split is deliberate. `glyph` names the Figma-side element type (`ElementType`) and the detection convention (`Conventions.glyphs`); `icon` names the consumable asset and its registry. Neither is renamed here.
- `spec.images` admits only `REGISTRY` and `CUSTOM` because an image has no name-only form — the registry key is not a meaningful identifier outside the spec.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes.
- **Parity check**:
  - `IconValue` ↔ `component.schema.json#/definitions/IconValue`
  - `IconData` ↔ `component.schema.json#/definitions/IconData`
  - `Icons` ↔ `component.schema.json#/definitions/Icons`
  - `Element.content` ↔ `component.schema.json#/definitions/Element/properties/content`
  - `Component.icons` ↔ `component.schema.json#/definitions/Component/properties/icons`
  - `FoundationSources` ↔ `settings.schema.json#/definitions/FoundationSources`
  - `Settings.data.foundations` ↔ `settings.schema.json#/properties/data/properties/foundations`
  - `Settings.spec.icons` / `spec.images` ↔ `settings.schema.json#/properties/spec/properties/{icons,images}`
  - `FoundationMapping` / `FoundationEntry` ↔ `foundations.schema.json` root and `#/definitions/FoundationEntry`
- Every new named definition carries a named type, and every new type carries a definition — both directions of Constitution I.

---

## Downstream Impact

| Consumer | Impact | Highlights |
|----------|--------|------------|
| `specs-cli` | Update usage | Reads `data.foundations` during fetch and cache, merging declared files in order; honours `spec.icons` / `spec.images` when serializing; the standalone injection command becomes a manual re-run of behaviour that is now automatic. |
| `specs-from-figma` | Update usage | Emits the `icons` registry and the `$icon` pointer; applies the elected profile per concern; populates `IconData.src` from the declared sources, leaving it absent where nothing resolved. |
| `figma-from-specs` | Update usage | Resolves an `$icon` pointer back to a glyph component when rendering, where it previously read the name from `content` directly. Must still accept a bare string. |
| `react-from-specs` | Update usage | Resolves `$icon` through the registry to an import or asset path. A `CUSTOM` icon value is emitted as supplied, not interpreted. |
| `webcomponents-from-specs` | Update usage | Same obligation as React. |
| `from-specs` | Update usage | Reference resolution for the new pointer belongs in the shared core, beside the existing `$image` and `$slotContent` resolution. |
| `specs-plugin-2` | Recompile | Cannot read local foundation paths — no filesystem in the plugin runtime. A workspace using `foundations` gets the default profile under the plugin, and the divergence needs surfacing rather than silently differing. |

---

## Semver Decision

**Target version**: `0.41.0` — the version of `release/next`, the branch this ADR merges into.

**Change class**: `MINOR` — for CHANGELOG placement, not a version bump.

**Justification**: Every change is an added type, an added optional field, or a widened union admitting a new form while every existing value stays valid — "MINOR for additive types or new optional fields" per the constitution's Versioning rule. Two items deserve naming rather than burying:

- **The widened `content` union** is a compile-time obligation for consumers that narrow on it: a `typeof content === 'string'` branch no longer covers every case. This is the same obligation `ImageStyleValue` created when it gained `ImageValue`, which shipped MINOR-class at 0.28.0.
- **The added schema file** engages Constitution III's clause that adding a schema file is a breaking change. Treated as MINOR-class here on the reading that the clause guards against restructuring what consumers already resolve, consistent with `guidelines.schema.json` and `supplemental.schema.json`. §5 records this as a decision, not an omission.

---

## Consequences

- An icon reference in a published spec carries its resolved asset location, so a consumer can resolve it without access to the generated workspace cache.
- Icons, images, and tokens are resolved the same way: a registry on the component and a `$`-prefixed pointer at the reference site.
- Custom foundation shapes are elected per concern, so a team can carry its own icon references and stock token references at once.
- Foundation injection is declared in settings and happens on fetch, so a re-fetch no longer drops it.
- A foundation mapping file has a declared format and can be validated before a run consumes it.
- A workspace that declares `data.foundations` produces different spec output under the CLI than under the plugin, because the plugin runtime cannot read local files. This divergence is new, it is not resolvable in the schema, and it needs an explicit answer in the plugin before `foundations` is documented as a general capability.
- A `CUSTOM` concern is unvalidatable in that concern by construction — already true of `spec.tokens: CUSTOM`, now reachable for two more.
- `Element.content` admits three forms where it admitted two. Every consumer narrowing on it gains a branch.
