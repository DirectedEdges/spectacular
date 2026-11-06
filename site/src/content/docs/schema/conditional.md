---
title: "Conditional"
description: "Conditional style values driven by prop state"
---

A conditional expression that selects between two values based on a prop's state. Introduced in schema 0.13.0.

## Members

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `if.condition` | `ConditionExpression` | Yes | The test to evaluate |
| `if.then` | `string \| boolean \| number \| null` | Yes | Value when condition is true |
| `if.else` | `string \| boolean \| number \| null` | Yes | Value when condition is false |

## ConditionExpression

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `operation` | `string` | Yes | Operation to perform |
| `args.value` | [`PropBinding`](/schema/prop-binding/) | Yes | The prop to test |
| `args.compareTo` | `string \| number \| boolean \| null` | No | Comparison value (omitted for unary operations) |

### Operations

| Operation | Arity | Description |
|-----------|-------|-------------|
| `isNull` | Unary | Prop value is null |
| `isNotNull` | Unary | Prop value is not null |
| `equals` | Binary | Prop value equals `compareTo` |
| `notEquals` | Binary | Prop value does not equal `compareTo` |

## Example

Show or hide based on whether a slot prop has content:

```yaml
if:
  condition:
    operation: isNull
    args:
      value:
        $binding: "#/props/icon"
  then: false
  else: true
```

## Further Reading

- [ADR 018 — Conditional Visible Binding](https://github.com/DirectedEdges/specs/blob/main/adr/018-conditional-visible-binding.md) — introduces the `Conditional` type for declarative visibility derived from nullable props
