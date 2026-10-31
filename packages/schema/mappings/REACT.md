# React binding

**Platform binding for the Specs document format — draft.**

Normative frame: [`SPECIFICATION.md`](../SPECIFICATION.md) §11.

## Inherits from [CSS](CSS.md)

Emits React components and stories. Styling is delegated wholly to the CSS binding.

**Every style key is bound exactly as the [CSS](CSS.md) binding states**, unless overridden below. This binding never restates an inherited mapping: a second copy of a rule is a second thing to keep true.

## Style overrides

**None.** Every style key is inherited unchanged.

## Platform surfaces

The platform-shaped questions this binding owes, none of which are CSS. All unverified.

| Surface | Disposition |
|---|---|
| `propsToParameters` | **unverified** |
| `slotsToChildren` | **unverified** |
| `variantsToSelection` | **unverified** |
| `styleAttachment` | **unverified** |

## Absent keys

Inherited. See [Style defaults](DEFAULTS.md).
