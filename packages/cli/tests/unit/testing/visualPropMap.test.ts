// How a Figma component property name is matched to the story arg that
// reproduces it — `buildPropMap` in the visual manifest.
//
// Three ways a name resolves, in the order the function tries them: a prop
// recording that Figma name, a folded object member recording it (ADR-111), and
// finally a plain camelized guess. The member case is the one with teeth: the
// flat prop the Figma name belonged to no longer exists in the contract, so the
// mapping has to answer the member's dotted arg key and take its type and
// default from the member rather than from the vanished parent.
import { describe, it, expect } from 'vitest';
import { buildPropMap } from '../../../src/testing/visual/manifest.js';
import type { Contract } from '../../../src/testing/visual/specIndex.js';

const contract = (props: string[], defaults: Record<string, unknown> = {}): Contract => ({
  props: new Set(props),
  defaults,
  enumOptions: {},
});

const enumMember = (name: string) => ({
  type: 'string',
  default: 'Default',
  enum: ['Default', 'Alternate'],
  $extensions: { 'com.figma': { name } },
});

describe('buildPropMap — a flat prop', () => {
  it('matches on the Figma name the prop recorded', () => {
    const { propMap, unmapped } = buildPropMap(
      new Set(['URL field']),
      { urlField: { type: 'string', $extensions: { 'com.figma': { name: 'URL field' } } } },
      contract(['urlField']),
    );
    expect(unmapped).toEqual([]);
    expect(propMap['URL field']).toEqual({ prop: 'urlField', type: 'string', kind: 'arg', default: null });
  });

  it('falls back to camelizing the Figma name when no prop recorded it', () => {
    const { propMap } = buildPropMap(
      new Set(['Icon leading']),
      { iconLeading: { type: 'boolean', default: false } },
      contract(['iconLeading']),
    );
    expect(propMap['Icon leading'].prop).toBe('iconLeading');
  });

  it('prefers the contract default over the spec default', () => {
    const { propMap } = buildPropMap(
      new Set(['Size']),
      { size: { type: 'string', default: 'medium' } },
      contract(['size'], { size: 'large' }),
    );
    expect(propMap['Size'].default).toBe('large');
  });

  it('classifies a prop the contract does not declare as an interaction', () => {
    // `state` is CSS pseudo-classes at render time, so no arg can express it.
    const { propMap } = buildPropMap(
      new Set(['State']),
      { state: { type: 'string', default: 'rest' } },
      contract([]),
    );
    expect(propMap['State'].kind).toBe('interaction');
  });

  it('reports a name nothing answers to', () => {
    const { propMap, unmapped } = buildPropMap(new Set(['Ghost prop']), {}, contract([]));
    expect(unmapped).toEqual(['Ghost prop']);
    expect(propMap).toEqual({});
  });
});

describe('buildPropMap — a folded object member (ADR-111)', () => {
  const apiProps = {
    anObjectProp: {
      type: 'object',
      members: {
        variant1: enumMember('AnObjectProp.Variant1'),
        variant2: enumMember('AnObjectProp.Variant2'),
      },
    },
  };

  it('answers the member dotted arg key, not the vanished flat prop', () => {
    const { propMap, unmapped } = buildPropMap(
      new Set(['AnObjectProp.Variant1']),
      apiProps,
      contract(['anObjectProp']),
    );
    expect(unmapped).toEqual([]);
    expect(propMap['AnObjectProp.Variant1'].prop).toBe('anObjectProp.variant1');
  });

  it('takes type and default from the member', () => {
    const { propMap } = buildPropMap(
      new Set(['AnObjectProp.Variant1']),
      apiProps,
      contract(['anObjectProp']),
    );
    expect(propMap['AnObjectProp.Variant1'].type).toBe('string');
    expect(propMap['AnObjectProp.Variant1'].default).toBe('Default');
  });

  it('ignores a contract default keyed by the parent, which is a different value', () => {
    // `defaults.anObjectProp` would be the whole object, never one member's value.
    const { propMap } = buildPropMap(
      new Set(['AnObjectProp.Variant1']),
      apiProps,
      contract(['anObjectProp'], { anObjectProp: { variant1: 'Alternate' } }),
    );
    expect(propMap['AnObjectProp.Variant1'].default).toBe('Default');
  });

  it('decides arg or interaction by the parent, since that is what the contract declares', () => {
    const declared = buildPropMap(new Set(['AnObjectProp.Variant1']), apiProps, contract(['anObjectProp']));
    expect(declared.propMap['AnObjectProp.Variant1'].kind).toBe('arg');

    const absent = buildPropMap(new Set(['AnObjectProp.Variant1']), apiProps, contract([]));
    expect(absent.propMap['AnObjectProp.Variant1'].kind).toBe('interaction');
  });

  it('maps each member separately rather than collapsing them onto the parent', () => {
    const { propMap } = buildPropMap(
      new Set(['AnObjectProp.Variant1', 'AnObjectProp.Variant2']),
      apiProps,
      contract(['anObjectProp']),
    );
    expect(propMap['AnObjectProp.Variant1'].prop).toBe('anObjectProp.variant1');
    expect(propMap['AnObjectProp.Variant2'].prop).toBe('anObjectProp.variant2');
  });

  it('resolves a flat prop and a member of the same dotted family side by side', () => {
    // TEST Object Prop 5's shape: one member folded, a sibling left flat because
    // the fold would have collided with an existing key.
    const mixed = {
      notAnObjectProp: {
        type: 'object',
        members: { variant1: enumMember('NotAnObjectProp.Variant1') },
      },
      notAnObjectPropVariant2: enumMember('NotAnObjectProp.Variant2'),
    };
    const { propMap, unmapped } = buildPropMap(
      new Set(['NotAnObjectProp.Variant1', 'NotAnObjectProp.Variant2']),
      mixed,
      contract(['notAnObjectProp', 'notAnObjectPropVariant2']),
    );
    expect(unmapped).toEqual([]);
    expect(propMap['NotAnObjectProp.Variant1'].prop).toBe('notAnObjectProp.variant1');
    expect(propMap['NotAnObjectProp.Variant2'].prop).toBe('notAnObjectPropVariant2');
  });

  it('does not reach a member through a camelized guess', () => {
    // Without the recorded name there is nothing tying `AnObjectProp.Variant1`
    // to a member, and camelizing it yields a key no prop has. Unmapped is the
    // honest answer; guessing would bind a story arg to the wrong property.
    const unrecorded = {
      anObjectProp: { type: 'object', members: { variant1: { type: 'string', default: 'Default' } } },
    };
    const { unmapped } = buildPropMap(new Set(['AnObjectProp.Variant1']), unrecorded, contract(['anObjectProp']));
    expect(unmapped).toEqual(['AnObjectProp.Variant1']);
  });
});
