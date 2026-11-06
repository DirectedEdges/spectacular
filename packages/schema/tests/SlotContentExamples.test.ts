/**
 * Structural conformance tests for the slotContentExamples / instanceExamples
 * feature (ADR-046 / ADR-048 / ADR-049 / ADR-050).
 *
 * SCHEMA-VALIDATOR DECISION:
 *   The schema package has NO JSON-schema validator dependency (package.json
 *   devDeps = typescript only). Per task constraints we do NOT add a new
 *   dependency. Instead this is a focused *structural* test: representative
 *   generated objects are typed against the package's TS types (compile-time
 *   conformance) AND checked against the relevant `component.schema.json`
 *   definitions read directly from disk (required keys + additionalProperties:
 *   false on InstanceExample/SlotContentRef). Full Ajv-style JSON-schema
 *   validation is a follow-up.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type {
  Component,
  SlotContent,
  InstanceExample,
  InstanceExamples,
  SlotContentRef,
  PropConfigurations,
  NestedPropConfiguration,
} from '../types/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(path.join(here, '..', 'schema', 'component.schema.json'), 'utf8')
) as { definitions: Record<string, any> };

// ─── Representative generated objects (typed against the package types) ────────

const slotRef: SlotContentRef = {
  $slotContent: '#/components/pill/slotContentExamples/composedLabel',
};

const composedLabel: SlotContent = {
  anatomy: {},
  elements: {},
  layout: [],
};

const slotContentExamples: Record<string, SlotContent> = {
  composedLabel,
};

const instanceExample: InstanceExample = {
  title: 'With composed label',
  propConfigurations: {
    label: 'Hello',
    count: 3,
    selected: true,
    content: slotRef,
  },
};

const instanceExamples: InstanceExamples = {
  withComposedLabel: instanceExample,
};

const component: Component = {
  title: 'Pill',
  anatomy: {},
  props: {},
  default: {} as Component['default'],
  variants: [],
  slotContentExamples,
  instanceExamples,
  metadata: {} as Component['metadata'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function objectKeys(o: object): string[] {
  return Object.keys(o);
}

describe('SlotContentRef structural conformance', () => {
  const def = schema.definitions.SlotContentRef;

  it('schema requires $slotContent and forbids extra props', () => {
    expect(def.required).toContain('$slotContent');
    expect(def.additionalProperties).toBe(false);
    expect(def.properties.$slotContent.type).toBe('string');
  });

  it('representative ref carries only the $slotContent key', () => {
    expect(objectKeys(slotRef)).toEqual(['$slotContent']);
    expect(typeof slotRef.$slotContent).toBe('string');
  });
});

describe('SlotContent structural conformance', () => {
  it('representative entry is the anatomy+elements+layout triplet', () => {
    expect(composedLabel).toHaveProperty('anatomy');
    expect(composedLabel).toHaveProperty('elements');
    expect(composedLabel).toHaveProperty('layout');
  });
});

describe('InstanceExample structural conformance', () => {
  const def = schema.definitions.InstanceExample;

  it('schema forbids extra top-level props and allows title + propConfigurations', () => {
    expect(def.additionalProperties).toBe(false);
    expect(objectKeys(def.properties).sort()).toEqual(['propConfigurations', 'title']);
  });

  it('propConfigurations accepts scalars OR a SlotContentRef (oneOf)', () => {
    expect(def.properties.propConfigurations.additionalProperties.$ref).toBe('#/definitions/InstanceExampleConfigurationValue');
    const oneOf = schema.definitions.InstanceExampleConfigurationValue.oneOf as any[];
    const kinds = oneOf.map((s) => s.type ?? s.$ref);
    expect(kinds).toContain('#/definitions/Scalar');
    expect(kinds).toContain('#/definitions/SlotContentRef');
  });

  it('representative instanceExample only uses allowed top-level keys', () => {
    for (const key of objectKeys(instanceExample)) {
      expect(['title', 'propConfigurations']).toContain(key);
    }
  });

  it('representative propConfigurations values are scalars or SlotContentRefs', () => {
    const cfg = instanceExample.propConfigurations!;
    for (const value of Object.values(cfg)) {
      const ok =
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        (typeof value === 'object' && value !== null && '$slotContent' in value);
      expect(ok).toBe(true);
    }
  });
});

describe('PropConfigurations.$nested structural conformance (ADR-052)', () => {
  const propDef = schema.definitions.PropConfigurations;
  const nestedDef = schema.definitions.NestedPropConfiguration;

  // Regular prop entries and the reserved $nested list coexist on one instance
  const boundaryConfig: PropConfigurations = {
    density: 'comfortable',
    toolbar: slotRef,
    $nested: [
      { path: ['filterHeader', 'row'], children: slotRef },
      { path: ['filterContent', 'row'], children: slotRef },
    ],
  };

  it('PropConfigurations defines a $nested property (array of NestedPropConfiguration)', () => {
    expect(propDef.properties.$nested.type).toBe('array');
    expect(propDef.properties.$nested.items.$ref).toBe('#/definitions/NestedPropConfiguration');
  });

  it('both objects share the PropConfigurationValue definition for their value union', () => {
    expect(propDef.additionalProperties.$ref).toBe('#/definitions/PropConfigurationValue');
    expect(nestedDef.additionalProperties.$ref).toBe('#/definitions/PropConfigurationValue');
    const kinds = (schema.definitions.PropConfigurationValue.oneOf as any[]).map((s) => s.type ?? s.$ref);
    expect(kinds).toEqual(
      expect.arrayContaining(['#/definitions/Scalar', '#/definitions/PropBinding', '#/definitions/SlotContentRef'])
    );
    const scalarKinds = (schema.definitions.Scalar.oneOf as any[]).map((s) => s.type);
    expect(scalarKinds).toEqual(['string', 'number', 'boolean']);
  });

  it('PropConfigurationValue admits null — the prop is unset in this configuration (ADR-080)', () => {
    const kinds = (schema.definitions.PropConfigurationValue.oneOf as any[]).map((s) => s.type ?? s.$ref);
    expect(kinds).toContain('null');
  });

  it('InstanceExample.propConfigurations admits null, and still refuses PropBinding (ADR-080)', () => {
    const value = schema.definitions.InstanceExampleConfigurationValue;
    const kinds = (value.oneOf as any[]).map((s) => s.type ?? s.$ref);
    expect(kinds).toContain('null');
    expect(kinds).not.toContain('#/definitions/PropBinding');
  });

  it('NestedPropConfiguration requires path (array of strings, minItems 1)', () => {
    expect(nestedDef.required).toContain('path');
    expect(nestedDef.properties.path.type).toBe('array');
    expect(nestedDef.properties.path.items.type).toBe('string');
    expect(nestedDef.properties.path.minItems).toBe(1);
  });

  it('representative $nested entries are instanceOf-key paths terminating in a slot fill', () => {
    for (const entry of boundaryConfig.$nested!) {
      expect(Array.isArray(entry.path)).toBe(true);
      entry.path.forEach((seg) => expect(typeof seg).toBe('string'));
      const { path, ...payload } = entry as NestedPropConfiguration;
      void path;
      for (const value of Object.values(payload)) {
        expect(typeof value === 'object' && value !== null && '$slotContent' in value).toBe(true);
      }
    }
  });
});

describe('Component-level example registries', () => {
  it('slotContentExamples / instanceExamples live at the component root', () => {
    expect(component.slotContentExamples).toBe(slotContentExamples);
    expect(component.instanceExamples).toBe(instanceExamples);
  });

  it('every instanceExample SlotContentRef pointer resolves into slotContentExamples', () => {
    const reg = component.slotContentExamples ?? {};
    for (const ex of Object.values(component.instanceExamples ?? {})) {
      for (const value of Object.values(ex.propConfigurations ?? {})) {
        if (typeof value === 'object' && value !== null && '$slotContent' in value) {
          const key = (value as SlotContentRef).$slotContent.split('/').pop()!;
          expect(reg).toHaveProperty(key);
        }
      }
    }
  });
});
