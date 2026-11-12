---
title: "image"
description: "Emit a real image element, and let the accessible name decide whether it is announced or decorative"
---

`image` declares that an element *is* a picture — a photo, an illustration, a chart, an avatar, a logo. Without it an image drawn in Figma emits as a container with a `background-image` declaration, which announces nothing, carries no name, and gives a consumer no place to put the one fact only they know: what this particular picture shows. The alt-text rule that follows from that — **decorative unless something names it** — then has to be hand-authored per component, in every consuming codebase, forever.

**Status** — React: Implemented • Web Components: Implemented • iOS: Not yet planned • Android: Not yet planned

The concept is named `image` and the web emission is `role="img"`. The web token is an abbreviation; the concept is not.

## Roles

Apply the following roles to elements:

| Role | Type | Element |
|---|---|---|
| `image` | Control | Element of `type: rectangle`, `type: ellipse`, `type: container`, `type: glyph`, or `type: vector` |
| `label` | Part | Element of `type: text` or nested instance prop of `type: string` |

`image` joins `button`, `togglebutton`, `link`, and `disclosure` as a **non-value-bearing** accepting control, so a `label` part resolves to it by proximity. It accepts no other part.

What is emitted depends on both the element and whether a name resolves:

| Landing on | Named | Unnamed |
|---|---|---|
| An element whose only fill is an image and which has no children | `<img src alt={name}>` | `<img src alt="">` |
| `glyph` or `vector` | `role="img"` and `aria-label={name}` on the drawing | `aria-hidden="true"` on the drawing |
| A container with children, or an image behind content | `role="img"` and `aria-label={name}` on the existing tag | Tag unchanged; nothing emitted |

A drawing is not an `<svg>` in either web target — both emit a span carrying the glyph as a CSS mask — so the attributes land on that span and nothing emits `focusable="false"`, which belongs on an `<svg>` root.

The first row is the only one that swaps the element, so it is the only one the [swapped-element reset](/roles/#what-a-swapped-element-looks-like) applies to. Alongside the shared declarations, the `<img>` takes `display: block`, `width: 100%` and `height: 100%`, and the fill moves from `background-image` to the `src` attribute with `object-fit` carrying the fit.

**The sizing is not cosmetic.** An image element carries an intrinsic size and the box it replaced did not, so a flex parent stretches a `<div>` to the full cross axis and does not stretch a replaced element. Left unsized, the box takes the asset's own proportions — and `object-fit` then has nothing to fit, so `cover` and `contain` render identically.

**`aria-hidden` is not emitted on the first or third row, and that is not an omission.** An `<img alt="">` is already removed from the accessibility tree by the empty `alt`, and an unnamed container announces nothing to begin with. The drawing row states it because a glyph span is hidden by default: the role's conditional attribute is what *un-hides* a named one. An element that needs its whole subtree hidden is a [decoration](/roles/decoration/), not an unnamed image.

### The accessible name

The switch the role owns. Resolution order, first match wins:

| Source | Result |
|---|---|
| The `alt` prop a consumer sets | Names it |
| A `label` part that resolves to this image | Names it; the caption text becomes the name |
| A prop nominated as the accessible-name source in `conventions/specs.yaml` | Names it |
| Nothing resolves | **Decorative.** `alt=""`, no warning |

Nothing resolving is the one case in this vocabulary where silence is the correct answer rather than a warning. A library's image component does not know whether any given instance is a meaningful photo or a background flourish, so the design file cannot say, and a warning on every unnamed image would fire on every correct use. What the role guarantees instead is that the decorative case is *explicitly* decorative in the markup rather than accidentally unlabelled.

### The source

| Where the image comes from | What the role does |
|---|---|
| A prop of `type: image` | That prop is the source; the role adds no source prop |
| A fill referencing the spec's `images` registry with a resolved `src` | Emits that path as the default |
| A registry entry with no resolved `src`, and no image prop | **Warns** and leaves the element alone |

The role never fabricates a source. An element it cannot give a picture to emits as it did before.

An image prop distinguishes two ways of having no value, and they resolve differently:

| What the consumer passes | What renders |
|---|---|
| Nothing — the prop is never mentioned | The prop's authoring-default example, so the component looks like itself out of the box |
| An explicitly empty value | The placeholder surface, so an image slot that is genuinely awaiting content is visible as such |

Unset and empty are different statements, and collapsing them hides one of the two cases a consumer needs.

## Specs

Component anatomy typically has elements and roles like:

```yaml
anatomy:
  root:
    type: container
  media:
    type: rectangle
    role: image
  caption:
    type: text
    role: label
props:
  source:
    type: image
    default: '#/images/placeholder'
```

## Figma

Annotate the following layers:

- the layer carrying the image fill as `role:image` — the rectangle, ellipse, or frame the picture is painted into
- a visible caption as `role:label`, where the caption is genuinely the picture's name

For the `<img>` path, the annotated layer must hold the image fill **and nothing else** — no child layers, no second fill. A frame that paints an image behind text is the third row of the table above: it keeps its tag and takes the attributes.

A masked or cropped image is usually a frame with a child, so the role lands on the child that carries the fill, not on the mask.

## React

### Implementation

```tsx
<Avatar source={user.photo} alt={`${user.name}, profile photo`} />
<Avatar source={user.photo} />
```

The second is decorative on purpose — the name beside it already says who it is, and a screen reader that also reads the photo says it twice.

### Before / After

```tsx
// before
<div
  className="avatar__media"
  data-element="media"
  style={{ backgroundImage: `url(${p.source})` }}
/>

// after
<img
  className="avatar__media"
  data-element="media"
  src={p.source}
  alt={p.alt ?? ''}
/>
```

### Contract

| Prop | Type | Tier | Generated body |
|---|---|---|---|
| `alt?` | `string` | MUST | Emitted as `alt`; absent or empty means decorative |
| `onLoad?` / `onError?` | `(e: SyntheticEvent) => void` | COULD | Forwarded to the element |

No `src` prop is generated. A library whose image component has no image prop has not declared a source, and the role does not invent one.

Where a prop is nominated as the accessible-name source, `alt` is not generated — the library already has the prop, and two props for one fact is the thing the nomination exists to prevent.

## Web Components

The custom element **is** the root, so a root `image` cannot become an `<img>` tag. A real `<img>` is emitted **inside** the shadow root, and the host keeps the root's layout and appearance:

- The inner image is exposed as `part="image"`. A non-root image claims no part of its own, because the element already carries one named for its anatomy key
- `alt` binds into the inner `<img>` from the component's own member, and is empty where the member is unset — the decorative case
- A non-root `image` is an ordinary element in the template and carries the tag directly
- Conditional semantics spell through Lit's `nothing`; `undefined` would reach the DOM as that string

Name routing across a shadow boundary does not apply here, because an image's name is a string rather than an id reference — `aria-label` and `alt` both carry text, so the [`partText()` convention](/roles/#parts-across-a-composed-component) is not needed. A composed caption component providing `label` is the one exception, and it uses that convention like any other text-bearing part.

## iOS

Not yet planned. Intended binding:

| | |
|---|---|
| Type | `Image` |
| Named | `.accessibilityLabel(name)`; announced as "Image" plus the name |
| Unnamed | `.accessibilityHidden(true)` |
| Fit | `.resizable()` with `.scaledToFill()` / `.scaledToFit()` from `objectFit` |

## Android

Not yet planned. Intended binding:

| | |
|---|---|
| Type | `Image` |
| Named | `contentDescription = name` |
| Unnamed | `contentDescription = null` — the platform's own decorative signal |
| Fit | `contentScale = ContentScale.Crop` / `ContentScale.Fit` from `objectFit` |

Compose models decorative-unless-named directly: `contentDescription` is nullable, and null *means* decorative. The web path reaches the same outcome through an empty `alt`, and iOS through an explicit hide.

## Additional details

### Why the switch belongs to the transform

Alt text is the only accessibility fact in this vocabulary that varies per instance rather than per component. A button's name is usually its own text; an image's name is whatever this one shows. So the design file can declare that an element is an image, and it cannot declare what the image says — which is exactly the split between a role and a [contract prop](/roles/#roles-and-actions).

Leaving that to the consumer without a role leaves it to each consumer *independently*: some set an `aria-label` on a `div`, some add a visually hidden span, and the ones who do nothing ship an image that is neither announced nor marked decorative. One declared concept makes the correct markup the default in both directions.

### An image that is always decorative

Where the design knows the element never carries meaning — a background texture, a divider flourish, a gradient panel — the answer is [`decoration`](/roles/decoration/), not an `image` left unnamed. Both produce markup assistive technology skips; they differ in what they assert. `image` says this is a picture whose name the consumer supplies, and an instance may supply one. `decoration` says this element conveys nothing, ever, and no instance can change that.

## See also

- [decoration](/roles/decoration/) — an element that conveys nothing, by declaration
- [indicator](/roles/indicator/) — decoration that specifically draws a control's state
- [label](/roles/label/) — the part that can name an image
- [Choosing a role](/roles/choosing/) — which of two plausible roles an element takes
- [Roles overview](/roles/) — the vocabulary and how roles are authored
