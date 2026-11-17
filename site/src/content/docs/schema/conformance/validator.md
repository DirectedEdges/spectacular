---
title: "Validator API"
description: "Validating whole documents and split concern sets with @directededges/specs-schema-core"
---

The package is a library — there is no command-line entry point. Every function takes parsed objects in and returns violations out; reading and parsing files is the caller's job, which keeps the package free of filesystem and layout policy.

```bash
npm install @directededges/specs-schema-core
```

## Whole documents

`validateDocument(document, kind)` runs the JSON Schema for the kind, then the rule catalogue:

```js
import { validateDocument } from '@directededges/specs-schema-core';
import { parse } from 'yaml';
import { readFileSync } from 'node:fs';

const doc = parse(readFileSync('specs/components/button.yaml', 'utf8'));
const { valid, violations } = validateDocument(doc, 'component');

for (const v of violations) {
  console.log(`${v.rule} at ${v.path}: ${v.message}`);
}
// DSPEC-11 at /variants/0/configuration/tone: prop "tone" is not declared in props
```

The kinds are `component`, `component-concern`, `composition-concern`, `components`, `conventions`, `settings`, `supplemental`, and `guidelines`. Violations are deterministic — sorted by path, then rule — so two runs over the same document report the same lines.

## Split specs — the preferred layout

A spec written per concern (`api.yaml`, `variants.yaml`, `examples.yaml`) is three valid documents and one component. The catalogue's rules cross that split — a configuration in the variants file is only judgeable against the props the api file declares — so the package owns the assembly. Pass the parsed files; missing ones are simply absent:

```js
import { validateConcernSet } from '@directededges/specs-schema-core';

const { valid, violations } = validateConcernSet({ api, variants, examples });

for (const v of violations) {
  console.log(`${v.concern}.yaml ${v.rule} at ${v.path}: ${v.message}`);
}
```

Each present document is validated against its own concern definition, then the catalogue runs over the merged whole. Every violation carries the `concern` it came from — schema failures from the file that failed, rule failures attributed by the path's first recognised member. For a composition's folder, pass `{ specKind: 'composition' }`.

`mergeConcerns(concerns)` is exported on its own for a consumer that wants the assembled document — it drops each file's `metadata` (the merged form is the whole-component shape, which carries no `concern`) and merges subcomponent slices per key. It lives here so every consumer merges the same way: two implementations that merged differently would disagree about conformance while agreeing about every file.

## The layers, separately

| Export | What it is |
|--------|------------|
| `schemaValidator(kind)` | The compiled ajv validator for a kind — raw `ValidateFunction`, for callers that process ajv errors themselves |
| `checkRules(document, kind, context)` | The catalogue alone, no schema layer |
| `concernValidators()` | The three per-concern component validators |
| `authoredValidator(kind)` | The supplemental / guidelines validators |
| `RULES` / `UNCHECKED_RULES` | The implemented rules, and the two declared uncheckable with their reasons |

`checkRules` takes a context for the facts a document cannot state about itself: `documentPath` (DSPEC-62 validates the `foundations/<concern>` directory, which only the path carries), `settings` (DSPEC-39 reads `spec.color`), and `exclude` — a set of rule IDs for a caller that checks some rules itself with more context. [`specs validate`](/cli/commands/validate/) uses `exclude` for the six rules its reference layer already resolves across the whole workspace.

## See Also

- [Conformance overview](/schema/conformance/) — what the identifiers mean and what each kind validates against
- [The conformance suite](/schema/conformance/fixtures/) — how an implementation is judged conforming
