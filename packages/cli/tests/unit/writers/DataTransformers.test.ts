import { describe, it, expect } from 'vitest';
import {
  splitComponentByConcern,
  extractApiFromSubcomponents,
  extractExamplesFromSubcomponents,
  hasExampleData,
  splitCompositionByConcern,
  hasCompositionExampleData,
} from '../../../src/writers/DataTransformers';

describe('splitComponentByConcern', () => {
  it('defaults missing props to {} (regression #84)', () => {
    const { api } = splitComponentByConcern({
      title: 'dsDivider',
      anatomy: {},
      metadata: {},
    });
    expect(api.props).toEqual({});
    expect(Array.isArray(api.props)).toBe(false);
  });

  it('passes through props object when present', () => {
    const props = { variant: { type: 'VARIANT', values: ['a', 'b'] } };
    const { api } = splitComponentByConcern({
      title: 'X',
      anatomy: {},
      props,
      metadata: {},
    });
    expect(api.props).toBe(props);
  });
});

describe('splitCompositionByConcern (ADR-109)', () => {
  it('never writes a props key — a composition has none (regression for the bug ADR-109 named)', () => {
    const { api } = splitCompositionByConcern({
      title: 'Search Results',
      anatomy: { root: { type: 'container' } },
      elements: {},
      layout: ['root'],
      metadata: {},
    });
    expect(api).not.toHaveProperty('props');
  });

  it('routes title/description/anatomy to api, elements/layout to variants', () => {
    const { api, variants } = splitCompositionByConcern({
      title: 'Search Results',
      description: 'Search results with filter sidebar',
      anatomy: { root: { type: 'container' } },
      elements: { root: {} },
      layout: ['root'],
      metadata: {},
    });
    expect(api.title).toBe('Search Results');
    expect(api.description).toBe('Search results with filter sidebar');
    expect(api.anatomy).toEqual({ root: { type: 'container' } });
    expect((api as any).elements).toBeUndefined();
    expect((api as any).layout).toBeUndefined();
    expect(variants.elements).toEqual({ root: {} });
    expect(variants.layout).toEqual(['root']);
    expect((variants as any).anatomy).toBeUndefined();
  });

  it('omits title/description when absent, rather than writing them as undefined', () => {
    const { api } = splitCompositionByConcern({
      anatomy: {},
      elements: {},
      layout: [],
      metadata: {},
    });
    expect(api).not.toHaveProperty('title');
    expect(api).not.toHaveProperty('description');
  });

  it('routes slotContent to examples, not slotContentExamples', () => {
    const { examples } = splitCompositionByConcern({
      anatomy: {}, elements: {}, layout: [],
      slotContent: { cardHeader: { anatomy: {}, elements: {}, layout: [] } },
      metadata: {},
    });
    expect(examples.slotContent).toEqual({ cardHeader: { anatomy: {}, elements: {}, layout: [] } });
    expect((examples as any).slotContentExamples).toBeUndefined();
  });

  it('hasCompositionExampleData is false when slotContent is absent or empty', () => {
    const { examples: none } = splitCompositionByConcern({ anatomy: {}, elements: {}, layout: [], metadata: {} });
    expect(hasCompositionExampleData(none)).toBe(false);

    const { examples: empty } = splitCompositionByConcern({ anatomy: {}, elements: {}, layout: [], slotContent: {}, metadata: {} });
    expect(hasCompositionExampleData(empty)).toBe(false);
  });

  it('routes images to examples, and counts alone as example data (ADR-109 amendment)', () => {
    const { api, variants, examples } = splitCompositionByConcern({
      anatomy: {}, elements: {}, layout: [],
      images: { compositionHero__image: { src: '_images/abc123.png' } },
      metadata: {},
    });
    expect(examples.images).toEqual({ compositionHero__image: { src: '_images/abc123.png' } });
    expect(api).not.toHaveProperty('images');
    expect(variants).not.toHaveProperty('images');
    expect(hasCompositionExampleData(examples)).toBe(true);
  });
});

describe('extractApiFromSubcomponents', () => {
  it('defaults missing props on subcomponents to {} (regression #84)', () => {
    const result = extractApiFromSubcomponents({
      child: { title: 'child', anatomy: {}, metadata: {} },
    });
    expect(result?.child.props).toEqual({});
    expect(Array.isArray(result?.child.props)).toBe(false);
  });
});

describe('splitComponentByConcern — examples concern', () => {
  it('routes slotContentExamples and instanceExamples into examples (not api/variants)', () => {
    const { api, variants, examples } = splitComponentByConcern({
      title: 'Alert',
      anatomy: {},
      props: {},
      default: {},
      variants: [],
      slotContentExamples: { alert__children: { layout: [] } },
      instanceExamples: { alertHeadingOnly: { propConfigurations: {} } },
      metadata: { author: 'x' },
    });
    expect(examples.slotContentExamples).toEqual({ alert__children: { layout: [] } });
    expect(examples.instanceExamples).toEqual({ alertHeadingOnly: { propConfigurations: {} } });
    // Examples must not leak into the other concerns
    expect((api as any).slotContentExamples).toBeUndefined();
    expect((api as any).instanceExamples).toBeUndefined();
    expect((variants as any).slotContentExamples).toBeUndefined();
    expect((variants as any).instanceExamples).toBeUndefined();
  });

  it('omits example fields when the component has none', () => {
    const { examples } = splitComponentByConcern({
      title: 'Divider', anatomy: {}, props: {}, default: {}, variants: [], metadata: {},
    });
    expect(examples.slotContentExamples).toBeUndefined();
    expect(examples.instanceExamples).toBeUndefined();
    expect(hasExampleData(examples)).toBe(false);
  });

  it('collects subcomponent examples and reports them via hasExampleData', () => {
    const { examples } = splitComponentByConcern({
      title: 'Alert', anatomy: {}, props: {}, default: {}, variants: [], metadata: {},
      subcomponents: {
        actions: { title: 'Actions', metadata: {}, slotContentExamples: { actions__children: {} } },
      },
    });
    expect(examples.subcomponents?.actions.slotContentExamples).toEqual({ actions__children: {} });
    expect(hasExampleData(examples)).toBe(true);
  });
});

describe('splitComponentByConcern — images registry (ADR-063)', () => {
  it('routes images into examples and counts as example data — the dsAvatar case', () => {
    const { api, variants, examples } = splitComponentByConcern({
      title: 'dsAvatar',
      anatomy: {},
      default: {},
      images: { dsAvatar__image: { src: '_images/d54334d2.png' } },
      metadata: {},
    });
    expect(examples.images).toEqual({ dsAvatar__image: { src: '_images/d54334d2.png' } });
    expect(api).not.toHaveProperty('images');
    expect(variants).not.toHaveProperty('images');
    // Images alone must be enough for examples.yaml to be written.
    expect(hasExampleData(examples)).toBe(true);
  });

  it('routes subcomponent images into the subcomponent examples concern', () => {
    const subExamples = extractExamplesFromSubcomponents({
      media: {
        images: { media__root: { $extensions: { 'com.figma': { imageHash: 'abc' } } } },
        metadata: {},
      },
    });
    expect(subExamples?.media.images).toEqual({ media__root: { $extensions: { 'com.figma': { imageHash: 'abc' } } } });
  });
});

describe('splitComponentByConcern — single-example-kind components', () => {
  it('routes ONLY instanceExamples (no slotContentExamples) into examples', () => {
    const { api, variants, examples } = splitComponentByConcern({
      title: 'Badge', anatomy: {}, props: {}, default: {}, variants: [],
      instanceExamples: { badgeDefault: { propConfigurations: { tone: 'info' } } },
      metadata: {},
    });
    expect(examples.instanceExamples).toEqual({ badgeDefault: { propConfigurations: { tone: 'info' } } });
    expect(examples.slotContentExamples).toBeUndefined();
    expect(hasExampleData(examples)).toBe(true);
    expect((api as any).instanceExamples).toBeUndefined();
    expect((variants as any).instanceExamples).toBeUndefined();
  });

  it('routes ONLY slotContentExamples (no instanceExamples) into examples', () => {
    const { api, variants, examples } = splitComponentByConcern({
      title: 'Card', anatomy: {}, props: {}, default: {}, variants: [],
      slotContentExamples: { card__children: { anatomy: {}, elements: {}, layout: [] } },
      metadata: {},
    });
    expect(examples.slotContentExamples).toEqual({ card__children: { anatomy: {}, elements: {}, layout: [] } });
    expect(examples.instanceExamples).toBeUndefined();
    expect(hasExampleData(examples)).toBe(true);
    expect((api as any).slotContentExamples).toBeUndefined();
    expect((variants as any).slotContentExamples).toBeUndefined();
  });
});

describe('splitComponentByConcern — deeply nested subcomponent examples (>1 level)', () => {
  it('collects examples carried at a leaf two levels deep', () => {
    const { api, variants, examples } = splitComponentByConcern({
      title: 'Page', anatomy: {}, props: {}, default: {}, variants: [], metadata: {},
      subcomponents: {
        section: {
          title: 'Section', anatomy: {}, props: {}, default: {}, variants: [], metadata: {},
          subcomponents: {
            row: {
              title: 'Row', metadata: {},
              slotContentExamples: { row__children: { anatomy: {}, elements: {}, layout: [] } },
            },
          },
        },
      },
    });

    // Examples concern walks the full nesting and surfaces the leaf example.
    const leaf = examples.subcomponents?.section.subcomponents?.row;
    expect(leaf?.slotContentExamples).toEqual({ row__children: { anatomy: {}, elements: {}, layout: [] } });
    expect(hasExampleData(examples)).toBe(true);

    // The leaf example must NOT appear in api/variants subcomponent trees.
    const apiLeaf = (api.subcomponents?.section as any)?.subcomponents?.row;
    const varLeaf = (variants.subcomponents?.section as any)?.subcomponents?.row;
    expect(apiLeaf?.slotContentExamples).toBeUndefined();
    expect(varLeaf?.slotContentExamples).toBeUndefined();
  });

  it('prunes intermediate subcomponents that carry no examples down any branch', () => {
    const { examples } = splitComponentByConcern({
      title: 'Page', anatomy: {}, props: {}, default: {}, variants: [], metadata: {},
      subcomponents: {
        empty: {
          title: 'Empty', metadata: {},
          subcomponents: { alsoEmpty: { title: 'AlsoEmpty', metadata: {} } },
        },
      },
    });
    expect(examples.subcomponents).toBeUndefined();
    expect(hasExampleData(examples)).toBe(false);
  });
});

describe('splitComponentByConcern — $slotContent reference closure across split files', () => {
  // Walk a data structure and collect every $slotContent JSON-pointer target key.
  function collectSlotContentRefs(node: unknown, acc: string[] = []): string[] {
    if (Array.isArray(node)) {
      for (const item of node) collectSlotContentRefs(item, acc);
    } else if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      if (typeof obj.$slotContent === 'string') acc.push(obj.$slotContent);
      for (const v of Object.values(obj)) collectSlotContentRefs(v, acc);
    }
    return acc;
  }

  // Resolve a "#/components/X/slotContentExamples/KEY" pointer to its trailing key.
  function pointerKey(pointer: string): string {
    return pointer.split('/').pop() as string;
  }

  it('every $slotContent pointer in default/variants resolves into the examples concern', () => {
    const data = {
      title: 'Pill',
      anatomy: {},
      props: { label: { type: 'TEXT' } },
      default: {
        name: 'default',
        elements: {
          label: { propConfigurations: { content: { $slotContent: '#/components/pill/slotContentExamples/composedLabel' } } },
        },
        layout: [],
      },
      variants: [
        {
          name: 'state=active',
          elements: {
            label: { content: { $slotContent: '#/components/pill/slotContentExamples/activeLabel' } },
          },
        },
      ],
      slotContentExamples: {
        composedLabel: { anatomy: {}, elements: {}, layout: [] },
        activeLabel: { anatomy: {}, elements: {}, layout: [] },
      },
      metadata: {},
    };

    const { variants, examples } = splitComponentByConcern(data);

    // Pointers live in the variants concern (default + variants).
    const refs = [
      ...collectSlotContentRefs(variants.default),
      ...collectSlotContentRefs(variants.variants),
    ];
    expect(refs).toHaveLength(2);

    // Reference closure: every pointer target key must exist in the examples
    // concern's registry — no dangling pointers across the split files.
    const registry = examples.slotContentExamples ?? {};
    for (const pointer of refs) {
      const key = pointerKey(pointer);
      expect(registry, `dangling $slotContent pointer: ${pointer}`).toHaveProperty(key);
    }
  });

  it('instanceExamples SlotContentRefs also close against the examples registry', () => {
    const data = {
      title: 'Pill', anatomy: {}, props: {}, default: {}, variants: [],
      instanceExamples: {
        withSlot: {
          propConfigurations: { content: { $slotContent: '#/components/pill/slotContentExamples/composedLabel' } },
        },
      },
      slotContentExamples: { composedLabel: { anatomy: {}, elements: {}, layout: [] } },
      metadata: {},
    };

    const { examples } = splitComponentByConcern(data);
    const refs = collectSlotContentRefs(examples.instanceExamples);
    expect(refs).toHaveLength(1);
    const registry = examples.slotContentExamples ?? {};
    for (const pointer of refs) {
      expect(registry).toHaveProperty(pointerKey(pointer));
    }
  });
});

describe('extractExamplesFromSubcomponents', () => {
  it('includes only subcomponents that carry examples, else undefined', () => {
    const result = extractExamplesFromSubcomponents({
      withEx: { title: 'a', metadata: {}, instanceExamples: { ex1: {} } },
      without: { title: 'b', metadata: {} },
    });
    expect(result && Object.keys(result)).toEqual(['withEx']);

    const none = extractExamplesFromSubcomponents({
      a: { title: 'a', metadata: {} },
    });
    expect(none).toBeUndefined();
  });
});
