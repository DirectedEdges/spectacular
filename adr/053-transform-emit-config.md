# ADR 053: Transform Command and Configuration

**Branch**: `053-transform-emit-config`
**Created**: 2026-06-05
**Status**: ACCEPTED
**Summary**: A `transform` config block with `TransformEntry` drives the `specs transform` command's code artifact output.
**Decides**: none
**Deciders**: Nathan Curtis (author)
**Supersedes**: *(none)*
**RFC**: [RFC 001: Component Dictionary](../rfc/001-component-dictionary/README.md)

---

## Context

`specs-cli` currently produces a single artifact per component: a validated YAML contract (`{component}.yaml`). RFC 001 proposes a deterministic transformer registry that projects each contract into purpose-built derived files — the Component Dictionary.

This requires a new `specs transform` command and a corresponding configuration block. The command is conceptually distinct from `specs generate`: `generate` ingests from a source (Figma, HTML prototyping kit, etc.) and produces contracts; `transform` projects from already-validated contracts into derived files. Different triggers, different inputs, different cadences.

This ADR records the decisions for the command shape and its configuration surface in `specs-schema`.

---

## Options Considered

*(Pre-decided — no alternatives evaluated)*

---

## Decision

### Command shape (`specs-cli`)

```
specs transform [transformers...]
  [transformers...]   Zero or more transformer names to run.
                      Falls back to config.transform if omitted.
  -o, --output <path> Path to the contracts directory (input and output).
                      Resolved: flag → config.outputDirectory → default.
                      Defensive: -i / --input reserved for a future ingest path.
```

**Examples**:
```bash
specs transform                          # config defaults
specs transform -o ./specs               # explicit directory, config transformer list
specs transform -o ./specs contract      # single transformer
specs transform -o ./specs contract css tokens  # multiple transformers
```

**Resolution order** — mirrors the established `generate` pattern:
- `-o` flag → `config.outputDirectory` → process working directory default
- `[transformers...]` positionals → `config.transform` entries → built-in defaults

Assumes contracts were generated with `--split-components --split-concerns --use-subfolders`. Transformed files are written into each component's subfolder alongside its contract files.

### Type changes (`types/`)

| File | Change | Bump |
|------|--------|------|
| `Config.ts` | Add exported interface `TransformEntry` | MINOR |
| `Config.ts` | Add exported interface `TransformConfig` | MINOR |
| `Config.ts` | Add exported interface `ResolvedTransformConfig` | MINOR |
| `Config.ts` | Add optional field `transform?: TransformConfig` to `Config` | MINOR |
| `Config.ts` | Add required field `transform: ResolvedTransformConfig` to `ResolvedConfig` | MINOR |
| `Config.ts` | Add `transform` entry to `DEFAULT_CONFIG` | MINOR |
| `types/index.ts` | Export `TransformEntry`, `TransformConfig`, `ResolvedTransformConfig` | MINOR |

**New types**:

```typescript
// A single transformer entry: name plus any transformer-specific options inline.
export interface TransformEntry {
  name: string;
  [option: string]: unknown;
}

// Transform configuration block on Config.
export interface TransformConfig {
  /** Transformers to run, each with optional inline options. Absence means CLI built-in defaults apply. */
  transformers?: TransformEntry[];
}

// Fully-resolved transform config after merge with DEFAULT_CONFIG.
export interface ResolvedTransformConfig {
  transformers: TransformEntry[];
}
```

**`Config` before / after**:

```typescript
// Before
export interface Config {
  processing: { ... };
  format: { ... };
  include: { ... };
}

// After
export interface Config {
  processing: { ... };
  format: { ... };
  include: { ... };
  /** Transformer selection and options for specs transform. Optional; absence means CLI defaults apply. @since 0.24.0 */
  transform?: TransformConfig;
}
```

**`DEFAULT_CONFIG` addition**:

```typescript
export const DEFAULT_CONFIG: ResolvedConfig = {
  processing: { ... },
  format: { ... },
  include: { ... },
  transform: {
    transformers: [],   // empty = run built-in defaults
  },
};
```

**Config example** (`specs.config.yaml`):

```yaml
transform:
  transformers:
    - name: contract
    - name: css
      keys: KEBAB
    - name: tokens
```

### Schema changes (`schema/`)

| File | Change | Bump |
|------|--------|------|
| `component.schema.json` | Add `TransformEntry` definition | MINOR |
| `component.schema.json` | Add `TransformConfig` definition | MINOR |
| `component.schema.json` | Add `transform` property to `#/definitions/Config` | MINOR |

**New schema definitions**:

```json
"TransformEntry": {
  "type": "object",
  "description": "A single transformer to run, identified by name, with optional inline options.",
  "properties": {
    "name": {
      "type": "string",
      "description": "Transformer name."
    }
  },
  "required": ["name"],
  "additionalProperties": true
},
"TransformConfig": {
  "type": "object",
  "description": "Transformer selection and options for specs transform.",
  "properties": {
    "transformers": {
      "type": "array",
      "items": { "$ref": "#/definitions/TransformEntry" },
      "description": "Transformers to run with optional inline options. Absence means CLI built-in defaults apply."
    }
  },
  "additionalProperties": false
}
```

**Addition to `#/definitions/Config/properties`**:

```json
"transform": {
  "$ref": "#/definitions/TransformConfig",
  "description": "Transformer selection and options for specs transform. Optional; absence means CLI defaults apply."
}
```

### Notes

- `transform` lives on `Config` (not a separate top-level type) so workspace and per-component overrides share the same shape and resolution chain — consistent with `processing`, `format`, and `include`.
- Transformer names are open strings — not versioned enums. The valid names and groups are enforced in `specs-cli`, not the schema. Adding new transformers requires no schema bump.
- Per-transformer options sit inline on `TransformEntry` alongside `name` (`additionalProperties: true` in schema). Individual option keys are transformer-defined and validated in `specs-cli`.
- An empty `transformers: []` in `DEFAULT_CONFIG` means "run built-in defaults." The CLI distinguishes absent config (no `transform` block) from an explicit empty list — both fall back to defaults, but an explicit list with entries overrides them.
- `ResolvedTransformConfig` is runtime-only and not serialized to component YAML.
- `-i / --input` is reserved for a future ingest path flag; `-o` handles the current single-directory case where contracts are read from and written to the same location.

---

## Type ↔ Schema Impact

- **Symmetric**: Yes
- **Parity check**:
  - `TransformEntry` → `#/definitions/TransformEntry` (object, `name` required, additional properties allowed)
  - `TransformConfig` → `#/definitions/TransformConfig` (object with `transformers` array)
  - `ResolvedTransformConfig` — runtime-only; no schema definition needed
  - `Config.transform` → `#/definitions/Config/properties/transform` (`$ref` to `TransformConfig`)

---

## Downstream Impact

| Consumer | Impact | Action required |
|----------|--------|-----------------|
| `specs-cli` | Primary consumer — reads `Config.transform` to resolve which transformers run; implements `transform` command, `-o` flag, positional transformer names, and transformer registry | Implement `transform` command |
| `specs-from-figma` | None — does not read or write `Config.transform` | Recompile against updated `Config` type |
| `specs-plugin-2` | None — plugin does not invoke `transform` | Recompile against updated `Config` type |

---

## Semver Decision

**Version bump**: `0.23.0 → 0.24.0` (`MINOR`)

**Justification**: All changes are additive — optional field on `Config`, new exported types. No existing fields removed, renamed, or narrowed.

---

## Consequences

- `Config` gains an optional `transform` block; existing consumers that don't use `specs transform` are unaffected
- `specs-cli` can read a fully-typed `TransformConfig` from `specs.config.yaml` without defining the shape locally
- Transformer names are not versioned in the schema; the registry is a CLI concern and can evolve without schema bumps
- Per-transformer option shapes remain open (`additionalProperties: true`) in v1; a future ADR can add specific option types if they stabilize into a shared contract
