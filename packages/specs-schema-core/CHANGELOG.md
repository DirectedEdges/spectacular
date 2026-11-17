# Changelog

All notable changes to `@directededges/specs-schema-core` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added

- **`validateDocument(document, kind)` decides a document's conformance**, running the JSON Schema for its kind and the specification's validator-class rule catalogue (§9), and reporting every failure by rule identifier — `DSPEC-nn` for a catalogue rule, `schema` for a JSON Schema failure. Formats (`uri`, `uri-reference`, `date-time`) are enforced via `ajv-formats`. The library API is the whole surface; there is no command-line entry point.
- **The conformance suite pairs every negative fixture with the one rule it violates** and asserts the reported rules are exactly that rule, so rejecting for the wrong reason — or a fixture violating two rules — fails. A completeness check requires every validator-class catalogue row to be implemented or declared in `UNCHECKED_RULES` with its reason (currently DSPEC-33 and DSPEC-63), and every implemented rule to carry a negative fixture.
- **`validateConcernSet` decides a split spec's conformance from its parsed concern files**, validating each against its own definition and running the catalogue over the merged whole, with every violation attributed to the concern it came from. `mergeConcerns` is exported on its own, so every consumer merges the split form the same way.
- **DSPEC-69 rejects a null `cornerSmoothing`**, which the shared unit-interval style value admits as "unset" and the render cannot act on. `0` is what no smoothing is.
- **`describeAjvErrors` collapses a failed `oneOf` over a closed vocabulary into one message naming the permitted values**, adding `or null` when a nullable branch failed. Errors are grouped by instance path, so unrelated failures never merge, and a group with no union error is described error by error. `describeAjvError` is unchanged for a single error, and now also describes a bare `const` failure by its allowed value.
- **`checkRules`, `schemaValidator`, `concernValidators` and `authoredValidator` expose the layers separately**, with `RuleContext.exclude` for a caller that checks some rules itself with workspace context — the seam `specs validate` consumes.
