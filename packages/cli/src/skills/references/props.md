<!--
  Reference shipped beside specs-cli.authoring.primer — not an invokable skill.
  Canonical; `specs skills install` overwrites it on every refresh.
-->

# Reference: the prop surface

Load with the **api pack**, before `api.yaml`. Assumes `specs-cli.authoring.primer` is read.

Props are declared in `api.yaml` under `props`, keyed by the prop name. The schema source of truth is `types/Props.ts` and `component-concern.schema.json`; every kind below names its interface there. Read the schema for what a field *means* — this reference carries the map: which kinds exist, what each one requires, and where a prop is read and set across the three files.

Judgment about props — naming, nullability, enum ordering, what earns a `default`, code-only props, invalid combinations — is in `rules/props.yaml` beside this skill. Where this file and that one seem to overlap, the rules file governs.

## The seven kinds

A prop's `type` plus the presence of one discriminating field decides its kind. `AnyProp` is the union; a prop outside it does not exist.

| Kind | `type` | Required beside `type` | Also accepts |
|---|---|---|---|
| `BooleanProp` | `boolean` | `default` | — |
| `StringProp` | `string` | — | `default`, `nullable`, `examples` |
| `EnumProp` | `string` | `default`, `enum` | `nullable` |
| `NumberProp` | `number` | — | `default`, `enum`, `nullable`, `examples` |
| `SlotProp` | `slot` | — | `default`, `nullable`, `minChildren`, `maxChildren`, `anyOf`, `defaultSlot` |
| `ImageProp` | `image` | — | `default`, `nullable`, `examples` |
| `ObjectProp` | `object` | `members` | — |

**`StringProp` and `EnumProp` both declare `type: string`.** The `enum` field is the whole difference, and it brings `default` with it: an open string may omit a default, a closed one may not. Reaching for "the string prop type" without deciding whether the value set is closed is how a prop ends up open that should have been an enum.

`NumberProp` carries the mirror case — `enum` is optional there, so a number prop is open unless it enumerates a scale.

`ObjectProp` members are one level deep by design: a member may be boolean, string, enum, or number, and never a slot, an image, or another object.

## `examples` and `default` are different fields

Both appear on `StringProp`, `NumberProp`, and `ImageProp`, and they answer different questions:

| Field | Says | Who reads it |
|---|---|---|
| `default` | What the component resolves to when a consumer passes nothing | The built component, on every platform |
| `examples` | What the prop was authored carrying — non-contractual reference material | Figma, as the prop's shown value |

Which of the two a requirement belongs in is a judgment, and `rules/props.yaml · default` carries it.

## Where a prop is read and set

One prop touches up to three files. This traversal is the part most worth getting right, because nothing in `api.yaml` alone shows it.

| Step | File | Written as |
|---|---|---|
| Declare it | `api.yaml` | `props.<name>: {type: …}` |
| Read its value into an element | `variants.yaml` | `$binding` on the element's `content`, `children`, `instanceOf`, or `styles.visible` |
| Make a variant activate on it | `variants.yaml` | the prop name under `variants[].configuration` |
| Set it on a nested instance | `variants.yaml` | the prop name under that element's `propConfigurations` |
| Set it in a documented usage | `examples.yaml` | the prop name under `instanceExamples.items.<name>.propConfigurations` |

A `$binding` resolves against **the owning scope's** props: a binding inside a subcomponent resolves against that subcomponent's own props, not the parent's.

## What a prop may drive

| Target | Where | Form |
|---|---|---|
| Text content or a glyph name | element `content` | `$binding` |
| Slot content | element `children` | `$binding`, as a `SlotBinding` with `examples` |
| Which component an instance is | element `instanceOf` | `$binding` |
| Visibility | element `styles.visible` | `$binding`, or a `Conditional` |
| A nested instance's own prop | element `propConfigurations` | `$binding`, or a literal |

**`visible` is the only style a prop may drive directly.** Every other appearance difference is a variant delta activated by a `configuration`, not a binding in styles. The judgment about when a conditional is the right form, and the one null-test operation that has any effect, is in `rules/variants.yaml · conditionals`.

## The Figma-side markers

Three prop facts are carried in `$extensions.com.figma` rather than in the prop's own fields, because they describe how the prop exists in the component set rather than what it is:

| Marker | On | States |
|---|---|---|
| `type: VARIANT` | a boolean prop whose value drives variant deltas | that it is a Figma variant axis, not a boolean toggle |
| `type: TEXT` with `source.kind: codeOnlyProp` | a prop that exists only in code | that there is no Figma variant axis for it |
| `visibilityProp` | a slot prop | the Figma property that shows and hides the part |

Enum props become variant axes on their own and take no marker. The exact declarations, and why each one matters, are in `rules/props.yaml · variantProps` and `· codeOnly`, and in `rules/subcomponents.yaml · visibility`.

## Where to go deeper

| Question | Goes to |
|---|---|
| What does this field mean, and what does it accept? | `Props.ts` and the schema's own property descriptions |
| Should this be a slot, an enum, or anatomy? | `rules/props.yaml`, `rules/slots.yaml` |
| How does a slot's fill get authored? | `references/slots.md` beside this file |
| Does platform X realise this prop kind? | `mappings/bindings/<platform>.json` |
