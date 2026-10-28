/**
 * Emitted YAML has to mean the same thing to a consumer on a YAML 1.1 parser as
 * it does to us on 1.2. The one place that is not automatic is a Figma node id:
 * `page:node` is a base-60 integer under 1.1, so `25:23` reads as 1523 and `42:2`
 * as 2522 — a plausible wrong value rather than an error.
 */
import { describe, it, expect } from 'vitest';
import yaml from 'yaml';
import { FileWriter } from '../../../src/writers/FileWriter.js';

const out = (content: Record<string, unknown>) => FileWriter.serialize(content, 'yaml');

describe('FileWriter.serialize — ids a YAML 1.1 parser would misread', () => {
  it('quotes a node id', () => {
    expect(out({ nodeId: '43:2' })).toBe("nodeId: '43:2'\n");
  });

  it('quotes an id whose minutes field is two digits', () => {
    expect(out({ pageId: '25:23' })).toBe("pageId: '25:23'\n");
  });

  it('quotes a three-part id', () => {
    // 1:2:3 is sexagesimal too — the grammar allows any number of groups.
    expect(out({ id: '1:2:3' })).toBe("id: '1:2:3'\n");
  });

  it('quotes ids wherever they sit in the tree', () => {
    // Node ids reach a spec from several places, which is why this is done by
    // visiting the document rather than at each id's own call site.
    const text = out({ metadata: { source: { pageId: '42:2', nodeId: '43:2' } } });
    expect(text).toContain("pageId: '42:2'");
    expect(text).toContain("nodeId: '43:2'");
  });

  it('quotes ids inside arrays', () => {
    expect(out({ ids: ['42:2', '43:2'] })).toBe("ids:\n  - '42:2'\n  - '43:2'\n");
  });
});

describe('FileWriter.serialize — object props pass through whole (ADR-111)', () => {
  it('round-trips members and member-keyed configuration values byte-identically', () => {
    const spec = {
      props: {
        margin: {
          type: 'object',
          members: {
            compact: { type: 'string', default: 'None', enum: ['None', 'Tight'], nullable: false,
              $extensions: { 'com.figma': { name: 'Margin.compact' } } },
          },
        },
      },
      variants: [{ configuration: { margin: { compact: 'Tight' } } }],
    };
    const text = out(spec);
    expect(yaml.parse(text)).toEqual(spec);
    // Serializing the parse again is byte-identical — nothing reshapes on the way through.
    expect(out(yaml.parse(text))).toBe(text);
  });
});

describe('FileWriter.serialize — everything else stays plain', () => {
  it('leaves an id whose second group exceeds 59 alone', () => {
    // 60 is out of range for a sexagesimal group, so 1.1 reads it as a string
    // already. Quoting it would be churn in every spec for no gain.
    expect(out({ nodeId: '42:60' })).toBe('nodeId: 42:60\n');
  });

  it('leaves ordinary strings plain', () => {
    expect(out({ type: 'COMPONENT_SET', title: 'Checkbox' })).toBe(
      'type: COMPONENT_SET\ntitle: Checkbox\n',
    );
  });

  it('leaves a bare key plain', () => {
    expect(out({ fieldLabel: 'Field.Label' })).toBe('fieldLabel: Field.Label\n');
  });

  it('leaves real numbers and booleans alone', () => {
    expect(out({ width: 303, visible: true })).toBe('width: 303\nvisible: true\n');
  });
});

describe('FileWriter.serialize — what a 1.1 consumer now reads', () => {
  it('round-trips a node id as a string, not an integer', () => {
    // The assertion that matters. `yaml` is 1.2 and would read either form
    // correctly, so this checks the shape a 1.1 parser keys on: the quotes.
    const text = out({ source: { pageId: '25:23', nodeId: '42:2' } });
    expect(text).toContain("'25:23'");
    expect(text).toContain("'42:2'");
    const back = yaml.parse(text) as { source: { pageId: unknown; nodeId: unknown } };
    expect(back.source.pageId).toBe('25:23');
    expect(back.source.nodeId).toBe('42:2');
  });
});

describe('FileWriter.serialize — JSON is untouched', () => {
  it('writes ids as plain JSON strings', () => {
    expect(FileWriter.serialize({ nodeId: '43:2' }, 'json')).toBe('{\n  "nodeId": "43:2"\n}');
  });
});
