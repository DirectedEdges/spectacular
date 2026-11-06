// Formatting a slot's primitive content from its `contentStyles` (ADR-102).
//
// Under `slotPrimitives` the primitive children leave anatomy, so the
// slot element's `contentStyles` is the only carrier of the label's typography
// and the glyph's fill. These tests pin where each property lands per tree —
// inherited text on the slot element, glyph box/fill on the emitters'
// masked-span vocabulary — and that variant overlays ride the per-variant
// blocks at ORDINARY priority. Nothing here is `!important`: `contentStyles`
// formats unstyled slotted content and must never outrank what a consumer
// wrote, which is also why the emitters no longer inline it except for a slot
// that admits a component, where these rules are withheld anyway.
//
// The fixture shape models a real badge spec: a slot whose `anyOf` mixes
// `$glyph` with components, a default `contentStyles.$glyph` with token-bound
// fillColor/width and a literal height, and variants restating only fillColor.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { CssTransformer } from '../../../../src/transforms/Css.js';

const transformer = new CssTransformer();

function makeContext(dir: string, componentKey: string) {
  return {
    specDir: dir, outputDir: dir, workspaceDir: dir, specsRoot: dir,
    kind: 'component' as const, componentKey, tokensFormat: 'TOKEN', outputFormat: 'JSON' as const,
  };
}

function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function run(
  dir: string,
  variantsData: Record<string, unknown>,
  apiYaml: Record<string, unknown>,
  componentKey = 'dsBadge',
): Promise<{ react: string; host: string }> {
  await fs.writeFile(path.join(dir, 'variants.yaml'), yaml.stringify(variantsData), 'utf-8');
  await transformer.run(apiYaml, makeContext(dir, componentKey));
  const prefix = toPascalCase(componentKey);
  const react = await fs.readFile(
    path.join(dir, 'react', 'src', 'components', prefix, 'styles.css'), 'utf-8');
  const host = await fs.readFile(
    path.join(dir, 'webcomponents', 'src', 'components', prefix, 'host.css'), 'utf-8');
  return { react, host };
}

function colorToken(token: string) {
  return { $token: token, $type: 'color' };
}
function dimensionToken(token: string) {
  return { $token: token, $type: 'dimension' };
}

/** A glyph-accepting slot beside components, modeled on a real badge spec. */
function glyphSlotSpec(variants: Array<Record<string, unknown>> = []) {
  return {
    default: {
      layout: [{ root: ['children'] }],
      elements: {
        root: { styles: { layoutMode: 'HORIZONTAL' } },
        children: {
          children: { $binding: '#/props/children' },
          styles: { layoutMode: 'HORIZONTAL' },
          contentStyles: {
            $glyph: {
              fillColor: colorToken('Color/On surface'),
              width: dimensionToken('Constants/Sizing/4x'),
              height: 16,
            },
          },
        },
      },
    },
    variants,
  };
}

const glyphSlotApi = {
  anatomy: {
    root: { type: 'container' },
    children: { type: 'slot' },
  },
  props: {
    children: { type: 'slot', anyOf: ['$glyph', 'dsIcon', 'dsMark'] },
    emphasized: { type: 'boolean', default: false },
  },
};

/** A `$glyph`-only slot — admits no component, so the glyph rules may land. */
const glyphOnlyApi = {
  anatomy: {
    root: { type: 'container' },
    children: { type: 'slot' },
  },
  props: {
    children: { type: 'slot', anyOf: ['$glyph'] },
    emphasized: { type: 'boolean', default: false },
  },
};

/**
 * A slot carrying no `anyOf` at all — the shape the generator writes when the
 * content it detected was primitives alone. `anyOf` is a CONSTRAINT, so a
 * marker-only list would narrow a slot the design never narrowed; the element's
 * `contentStyles` block is the only record that the slot holds primitive content
 * (ADR-102), and the slot identifies no component to distort.
 */
const noAnyOfApi = {
  anatomy: {
    root: { type: 'container' },
    children: { type: 'slot' },
  },
  props: {
    children: { type: 'slot' },
    emphasized: { type: 'boolean', default: false },
  },
};

/**
 * A text slot, its `anyOf` given as a list or omitted entirely. Shared by the
 * `$text` cases and the primitive-only cases, which differ only in that list.
 */
function textSlotSpec(
  anyOf: string[] | undefined,
  variants: Array<Record<string, unknown>> = [],
  defaultText: Record<string, unknown> | null = {
    textColor: colorToken('Color/On surface'),
    typography: { $token: 'Typography/font__200__medium', $type: 'typography' },
    textAlignHorizontal: 'CENTER',
  },
) {
  return {
    variants: {
      default: {
        layout: [{ root: ['label'] }],
        elements: {
          root: { styles: { layoutMode: 'HORIZONTAL' } },
          label: {
            children: { $binding: '#/props/label' },
            ...(defaultText ? { contentStyles: { $text: defaultText } } : {}),
          },
        },
      },
      variants,
    },
    api: {
      anatomy: { root: { type: 'container' }, label: { type: 'slot' } },
      props: {
        label: { type: 'slot', ...(anyOf ? { anyOf } : {}) },
        emphasized: { type: 'boolean', default: false },
      },
    },
  };
}

describe('slot contentStyles (ADR-102)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-content-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  describe('$glyph — the masked-span vocabulary', () => {
    it('formats the glyph fill against the emitters\' span, as a direct child of the slot', async () => {
      const { react } = await run(tmpDir, glyphSlotSpec(), glyphOnlyApi);
      expect(react).toContain('.ds-badge__children > [data-element][aria-hidden="true"] {');
      expect(react).toContain('background-color: var(--color-on-surface);');
      expect(react).toContain('width: var(--constants-sizing-4x);');
      expect(react).toContain('height: 16px;');
    });

    it('reaches the slotted glyph span through ::slotted() in the host sheet', async () => {
      const { host } = await run(tmpDir, glyphSlotSpec(), glyphOnlyApi);
      expect(host).toContain(
        '.ds-badge__children > slot::slotted([data-element][aria-hidden="true"]) {');
      expect(host).toContain('background-color: var(--color-on-surface);');
    });

    it('emits a variant\'s fillColor restatement at ordinary priority, under the variant\'s selector', async () => {
      const { react, host } = await run(tmpDir, glyphSlotSpec([
        {
          configuration: { emphasized: true },
          elements: {
            children: {
              contentStyles: { $glyph: { fillColor: colorToken('Color/Inverse on surface') } },
            },
          },
        },
      ]), glyphOnlyApi);
      expect(react).toContain('/* Variant: emphasized — children slot content */');
      expect(react).toMatch(
        /\.ds-badge\[data-emphasized[^\]]*\] \.ds-badge__children > \[data-element\]\[aria-hidden="true"\] \{\n {2}background-color: var\(--color-inverse-on-surface\);\n\}/,
      );
      expect(host).toMatch(
        /\.ds-badge__children > slot::slotted\(\[data-element\]\[aria-hidden="true"\]\) \{\n {2}background-color: var\(--color-inverse-on-surface\);\n\}/,
      );
      expect(react).not.toContain('!important');
      expect(host).not.toContain('!important');
    });

    it('a variant restating only contentStyles still produces its rule', async () => {
      // The variant's elements entry carries no `styles` at all — the content
      // delta alone must bring the element into the variant loop.
      const { react } = await run(tmpDir, glyphSlotSpec([
        {
          configuration: { emphasized: true },
          elements: {
            children: {
              contentStyles: { $glyph: { fillColor: colorToken('Color/Inverse on surface') } },
            },
          },
        },
      ]), glyphOnlyApi);
      expect(react).toContain('var(--color-inverse-on-surface)');
    });

    it('emits no non-inherited glyph declarations on a slot that admits a component', async () => {
      // `glyphSlotApi`'s anyOf mixes `$glyph` with `dsIcon`/`dsMark` — a slotted
      // icon component's own root is emitted as `<span {...rootAttrs}
      // aria-hidden="true" data-element="root">`, matching the same masked-span
      // selector a primitive glyph fill uses. The rule must not exist at all on
      // such a slot: the glyph's fill color, width and height are non-inherited
      // and would otherwise override the component's own color via `!important`
      // and win the default rule on specificity.
      const { react, host } = await run(tmpDir, glyphSlotSpec([
        {
          configuration: { emphasized: true },
          elements: {
            children: {
              contentStyles: { $glyph: { fillColor: colorToken('Color/Inverse on surface') } },
            },
          },
        },
      ]), glyphSlotApi);
      expect(react).not.toContain('[data-element][aria-hidden="true"]');
      expect(host).not.toContain('::slotted([data-element][aria-hidden="true"])');
    });
  });

  describe('$text — inherited properties on the slot element', () => {
    it('puts color, font and alignment on the slot element itself', async () => {
      const spec = textSlotSpec(['$text']);
      const { react, host } = await run(tmpDir, spec.variants, spec.api);
      for (const out of [react, host]) {
        expect(out).toContain('.ds-badge__label {');
        expect(out).toContain('color: var(--color-on-surface);');
        expect(out).toContain('font: var(--typography-font-200-medium);');
        expect(out).toContain('text-align: center;');
      }
    });

    it('puts truncation on the slot element only when the slot admits no component', async () => {
      const textOnly = textSlotSpec(['$text'], [], {
        textColor: colorToken('Color/On surface'),
        maxLines: 1,
        textOverflow: 'ELLIPSIS',
      });
      const { react } = await run(tmpDir, textOnly.variants, textOnly.api);
      expect(react).toContain('text-overflow: ellipsis;');
      expect(react).toContain('white-space: nowrap;');

      const mixed = textSlotSpec(['$text', 'dsBadge'], [], {
        textColor: colorToken('Color/On surface'),
        maxLines: 1,
        textOverflow: 'ELLIPSIS',
      });
      const mixedOut = await run(tmpDir, mixed.variants, mixed.api);
      // A truncation box on the slot element would clip a composed component.
      expect(mixedOut.react).not.toContain('text-overflow: ellipsis');
      expect(mixedOut.react).toContain('color: var(--color-on-surface);');
    });

    it('maps textAlignVertical to the same flex box the emitters inline', async () => {
      const spec = textSlotSpec(['$text'], [], {
        textAlignVertical: 'CENTER',
      });
      const { react } = await run(tmpDir, spec.variants, spec.api);
      expect(react).toContain('flex-direction: column;');
      expect(react).toContain('justify-content: center;');
    });

    it('a variant override stays on the slot element for a text-only slot, span selectors gone', async () => {
      const spec = textSlotSpec(['$text'], [
        {
          configuration: { emphasized: true },
          elements: {
            label: {
              contentStyles: { $text: { textColor: colorToken('Color/Inverse on surface') } },
            },
          },
        },
      ]);
      const { react, host } = await run(tmpDir, spec.variants, spec.api);
      // No emitter inlines this formatting for a slot that admits no component,
      // so there is no wrapper span to target and nothing to outrank: the rule
      // lands on the slot element and reaches the fill by inheritance, at a
      // priority a consumer's own styles beat.
      expect(react).toMatch(
        /\.ds-badge__label \{\n {2}color: var\(--color-inverse-on-surface\);\n\}/,
      );
      expect(host).toMatch(
        /\.ds-badge__label \{\n {2}color: var\(--color-inverse-on-surface\);\n\}/,
      );
      expect(react).not.toContain('> span {');
      expect(host).not.toContain('> slot > span {');
      expect(react).not.toContain('!important');
      expect(host).not.toContain('!important');
    });

    it('a variant override stays on the slot element, normal priority, without a default block', async () => {
      const spec = textSlotSpec(['$text'], [
        {
          configuration: { emphasized: true },
          elements: {
            label: {
              contentStyles: { $text: { textColor: colorToken('Color/Inverse on surface') } },
            },
          },
        },
      ], null);
      const { react } = await run(tmpDir, spec.variants, spec.api);
      // No default $text block, so no inline-styled span exists to outrank.
      expect(react).toMatch(
        /\.ds-badge__label \{\n {2}color: var\(--color-inverse-on-surface\);\n\}/,
      );
      expect(react).not.toContain('!important');
    });

    it('a variant override on a mixed slot emits inherited properties only, normal priority', async () => {
      const spec = textSlotSpec(['$text', 'dsBadge'], [
        {
          configuration: { emphasized: true },
          elements: {
            label: {
              contentStyles: {
                $text: {
                  textColor: colorToken('Color/Inverse on surface'),
                  maxLines: 2,
                },
              },
            },
          },
        },
      ]);
      const { react } = await run(tmpDir, spec.variants, spec.api);
      expect(react).toMatch(
        /\.ds-badge__label \{\n {2}color: var\(--color-inverse-on-surface\);\n\}/,
      );
      // No selector can single the primitive span out from a component fill,
      // and a line-clamp box on the slot element would clip the component.
      expect(react).not.toContain('line-clamp');
      expect(react).not.toContain('!important');
    });
  });

  describe('a slot with no anyOf — contentStyles is the only record', () => {
    it('emits the glyph rule for a slot whose only record of its content is contentStyles', async () => {
      // No `anyOf` at all: the generator detected primitives alone, and since
      // `anyOf` is a constraint it wrote none. The slot identifies no component,
      // so the non-inherited glyph rule has nothing to distort and must land —
      // the emitters no longer inline this formatting, so withholding it here
      // would leave the slot's formatting stated nowhere.
      const { react, host } = await run(tmpDir, glyphSlotSpec(), noAnyOfApi);
      expect(react).toContain('.ds-badge__children > [data-element][aria-hidden="true"] {');
      expect(react).toContain('background-color: var(--color-on-surface);');
      expect(react).toContain('width: var(--constants-sizing-4x);');
      expect(react).toContain('height: 16px;');
      expect(host).toContain(
        '.ds-badge__children > slot::slotted([data-element][aria-hidden="true"]) {');
      expect(react).not.toContain('!important');
      expect(host).not.toContain('!important');
    });

    it('emits a variant glyph delta for such a slot too', async () => {
      const { react } = await run(tmpDir, glyphSlotSpec([
        {
          configuration: { emphasized: true },
          elements: {
            children: {
              contentStyles: { $glyph: { fillColor: colorToken('Color/Inverse on surface') } },
            },
          },
        },
      ]), noAnyOfApi);
      expect(react).toContain('/* Variant: emphasized — children slot content */');
      expect(react).toMatch(
        /\.ds-badge\[data-emphasized[^\]]*\] \.ds-badge__children > \[data-element\]\[aria-hidden="true"\] \{\n {2}background-color: var\(--color-inverse-on-surface\);\n\}/,
      );
    });

    it('emits the box-level text properties for such a slot', async () => {
      const spec = textSlotSpec(undefined, [], {
        textColor: colorToken('Color/On surface'),
        maxLines: 1,
        textOverflow: 'ELLIPSIS',
        textAlignVertical: 'CENTER',
      });
      const { react } = await run(tmpDir, spec.variants, spec.api);
      expect(react).toContain('color: var(--color-on-surface);');
      expect(react).toContain('text-overflow: ellipsis;');
      expect(react).toContain('white-space: nowrap;');
      expect(react).toContain('justify-content: center;');
    });

    // A spec may state a slot's formatting ONLY under a variant — the default
    // needs no declaration, one configuration does. The slot still holds
    // primitive content; `contentStyles` presence has to be read across every
    // block, not off the default alone, or the overlay's own rules are withheld.
    // Two components in a real catalogue have exactly this shape.
    it('emits the glyph rule when contentStyles exists only in a variant overlay', async () => {
      const { react, host } = await run(tmpDir, {
        default: {
          layout: [{ root: ['children'] }],
          elements: {
            root: { styles: { layoutMode: 'HORIZONTAL' } },
            children: {
              children: { $binding: '#/props/children' },
              styles: { layoutMode: 'HORIZONTAL' },
            },
          },
        },
        variants: [
          {
            configuration: { emphasized: true },
            elements: {
              children: {
                contentStyles: {
                  $glyph: {
                    fillColor: colorToken('Color/Inverse on surface'),
                    width: dimensionToken('Constants/Sizing/4x'),
                  },
                },
              },
            },
          },
        ],
      }, noAnyOfApi);
      expect(react).toMatch(
        /\.ds-badge\[data-emphasized[^\]]*\] \.ds-badge__children > \[data-element\]\[aria-hidden="true"\] \{/,
      );
      expect(react).toContain('background-color: var(--color-inverse-on-surface);');
      expect(react).toContain('width: var(--constants-sizing-4x);');
      expect(host).toContain('slot::slotted([data-element][aria-hidden="true"])');
      expect(react).not.toContain('!important');
    });

    it('emits the box-level text properties when contentStyles exists only in a variant overlay', async () => {
      const spec = textSlotSpec(undefined, [
        {
          configuration: { emphasized: true },
          elements: {
            label: {
              contentStyles: {
                $text: {
                  textColor: colorToken('Color/Inverse on surface'),
                  maxLines: 1,
                  textOverflow: 'ELLIPSIS',
                },
              },
            },
          },
        },
      ], null);
      const { react } = await run(tmpDir, spec.variants, spec.api);
      expect(react).toContain('color: var(--color-inverse-on-surface);');
      expect(react).toContain('text-overflow: ellipsis;');
      expect(react).toContain('white-space: nowrap;');
      expect(react).not.toContain('!important');
    });

    it('emits nothing for a slot with neither an anyOf nor a contentStyles block', async () => {
      // Nothing identified either way: the slot keeps the open answer it has
      // always had, and with no contentStyles there is no formatting to state.
      const { react, host } = await run(tmpDir, {
        default: {
          layout: [{ root: ['children'] }],
          elements: {
            root: { styles: { layoutMode: 'HORIZONTAL' } },
            children: { children: { $binding: '#/props/children' } },
          },
        },
        variants: [],
      }, noAnyOfApi);
      expect(react).not.toContain('[data-element]');
      expect(host).not.toContain('::slotted');
    });
  });

  describe('scope', () => {
    it('emits nothing content-related for a spec without contentStyles', async () => {
      const { react, host } = await run(tmpDir, {
        default: {
          elements: {
            root: { styles: { layoutMode: 'HORIZONTAL' } },
            children: { children: { $binding: '#/props/children' } },
          },
        },
        variants: [],
      }, glyphSlotApi);
      expect(react).not.toContain('[data-element]');
      expect(host).not.toContain('::slotted');
    });

    it('token references resolve through the same pipeline as element styles', async () => {
      const spec = glyphSlotSpec();
      (spec.default.elements.root.styles as Record<string, unknown>).backgroundColor =
        colorToken('Color/On surface');
      const { react } = await run(tmpDir, spec, glyphOnlyApi);
      // Same token, same custom property — once from `styles`, once from `contentStyles`.
      expect(react).toContain('background: var(--color-on-surface);');
      expect(react).toContain('background-color: var(--color-on-surface);');
    });
  });
});
