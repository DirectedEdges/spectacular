<!--
  Reference shipped beside specs-cli.authoring.primer — not an invokable skill.
  Canonical; `specs skills install` overwrites it on every refresh.
-->

# Reference: subcomponents across the files

Load with the **api pack**, before `api.yaml`, when the request describes a part that exists only inside its parent. Assumes `specs-cli.authoring.primer` is read.

A subcomponent is a part with its own anatomy, props, or styling that is not independently usable. Authoring one writes **four names that have to agree**, spread across two files and one config file — and no single file shows them together. That is what this reference carries.

Every judgment — whether the part is a subcomponent at all, how the title is derived, why the key cannot be chosen, how visibility is modelled — is in `rules/subcomponents.yaml` beside this skill. Where this file and that one seem to overlap, the rules file governs.

## The four names, and where each lives

| Name | Lives in | Derived from |
|---|---|---|
| The `title` | `api.yaml` → `subcomponents.<key>.title` | the library's `figma.subcomponents.match` patterns in `config/conventions/figma.yaml` |
| The `subcomponents` key | `api.yaml` → `subcomponents.<key>` | the title's captured `{S}` segment, camelCased |
| The generated component key | `api.yaml` → the parent slot's `anyOf` | the parent's spec key with the subcomponent key capitalised onto it |
| The Figma visibility property | `api.yaml` → the slot prop's `$extensions.com.figma.visibilityProp` | read verbatim from the component set |

Only the first is authored freely, and even that is constrained by the config. The second and third are *derived*; the fourth is a literal read from Figma. `rules/subcomponents.yaml` carries the derivation for each and what breaks when one is chosen instead.

## The two `instanceOf` forms

A subcomponent is referenced differently from a catalogue component, and the distinction is the whole reason both forms exist:

| Form | Written as | Resolves to |
|---|---|---|
| Internal — a subcomponent of this spec | `instanceOf: {$ref: '#/subcomponents/<key>'}` | `subcomponents.<key>` in the same document |
| External — a catalogue component | `instanceOf: <component key>`, a plain string | that component's spec folder |

Both are written on an anatomy element and on the matching `elements` entry. The internal form is always within one document — it never crosses a file.

## The across-file picture

| File | Carries |
|---|---|
| `api.yaml` | the `subcomponents` entry with its own `title`, `anatomy`, `props`; the parent slot declaring `anyOf` and `maxChildren`; the slot prop's `visibilityProp` extension |
| `variants.yaml` | the slot element's `children` binding **and** its `visible` condition on the same prop |
| `examples.yaml` | the fill that instantiates the subcomponent, as a `slotContentExamples` triplet |

The `variants.yaml` row is the one that catches rounds out: a slot bound for content but not for visibility renders its box when the prop is empty. The pairing is in `rules/subcomponents.yaml · visibility`.

## Where to go deeper

| Question | Goes to |
|---|---|
| Is this a subcomponent, a slot-fill primitive, or its own component? | `rules/subcomponents.yaml · useWhen` |
| How is the title, key, or `anyOf` value derived? | `rules/subcomponents.yaml` |
| What shape does a `Subcomponent` take? | `Subcomponent.ts` and the schema's property descriptions |
| How is the slot itself declared and filled? | `references/slots.md` |
