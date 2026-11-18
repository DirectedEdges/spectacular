---
title: "Conformance Suite"
description: "The fixture corpus that decides whether a validator — this one or a second implementation — conforms"
---

The suite is a hand-authored fixture corpus plus the test that runs it, in `packages/specs-schema-core/tests/`. It is deliberately not derived from generated output: a generated corpus changes when the transforms change, is weighted toward whatever the fixtures exercised, and misses the value forms the schema admits that nothing happens to write. Every fixture is small enough to read, and each carries its own context — document kind, and where a rule needs one, a workspace path or settings block.

## Positive fixtures

Documents that MUST validate. Without them, a validator that rejects everything passes every negative test. The set covers:

- each document kind, including all three component concerns and a composition concern
- each in-document reference form — `$binding`, `$ref` to a subcomponent, `$slotContent`, `$image`, `$token`
- slots with `anyOf`, a default slot, primitive content and `contentStyles`
- roles (single and the instance-only array form), actions, and open prop extensions
- admitted-but-rarely-written value forms: a token on `itemSpacing`, a `Conditional` on `visible`, an inline `ColorObject`

## Negative fixtures

Documents that MUST be rejected, **each paired with the one rule it violates** — the fixture's filename and its `expect` field name the rule. The test asserts the reported rules are *exactly* the paired rule, which holds two things at once:

- a validator that rejects the fixture for the wrong reason does not conform
- a fixture that happens to violate two rules is defective, not stronger

One fixture exists per implemented catalogue rule, plus a set proving the schema-level constraints that were previously correct by inspection: the `format` constraints, cardinality (`minItems`, `minProperties`), closed value sets, closed property sets, and the concern documents' requires-what-it-carries exclusivity.

## Completeness

The suite reads the specification's §9 table and closes the loop in both directions:

- every validator-class row is implemented or named in `UNCHECKED_RULES` with its reason — adding a rule to the specification without implementing it fails the build
- every implemented rule has a negative fixture — implementing a rule without proving its rejection fails the build

This is the same shape of guard as the schema's own page-template test, and it exists for the same reason: a validator with no rule-paired negatives can stop checking a rule and still pass.

## See Also

- [Conformance overview](/schema/conformance/) — the two layers and the rule identifiers
- [Validator API](/schema/conformance/validator/) — running the same checks from your own code
