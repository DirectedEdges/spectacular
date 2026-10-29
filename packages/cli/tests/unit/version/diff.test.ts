import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { assemble } from '../../../src/version/assemble.js';
import { diffComponent, diffRun, findOrphans } from '../../../src/version/diff/compare.js';
import { buildRenameMap, emptyRenameMap } from '../../../src/version/diff/renames.js';
import { loadRules, bumpOf } from '../../../src/version/rules/grade.js';
import { makeWorkspace, removeWorkspace, editYaml } from './helpers.js';
import type { DiffEntry } from '../../../src/version/types.js';

const ruleSet = loadRules();
const noRenames = emptyRenameMap();

let baseDir: string;
let currentDir: string;

beforeAll(() => {
  baseDir = makeWorkspace('diff-base');
  currentDir = makeWorkspace('diff-current');
});

afterAll(() => {
  removeWorkspace(baseDir);
  removeWorkspace(currentDir);
});

function diffButton(edit: (doc: any) => void, concern = 'api'): { entries: DiffEntry[]; warnings: string[] } {
  const scratch = makeWorkspace('diff-scratch');
  try {
    editYaml(scratch, `specs/deButton/${concern}.yaml`, edit);
    const base = assemble(path.join(baseDir, 'specs'), 'deButton');
    const current = assemble(path.join(scratch, 'specs'), 'deButton');
    return diffComponent(base, current, { ruleSet, renames: noRenames });
  } finally {
    removeWorkspace(scratch);
  }
}

describe('diff engine — api.yaml', () => {
  it('reports no entries for identical components', () => {
    const base = assemble(path.join(baseDir, 'specs'), 'deButton');
    const current = assemble(path.join(currentDir, 'specs'), 'deButton');
    const { entries } = diffComponent(base, current, { ruleSet, renames: noRenames });
    expect(entries).toEqual([]);
  });

  it('grades an optional prop addition MINOR', () => {
    const { entries } = diffButton(doc => {
      doc.props.rounded = { type: 'boolean', default: false };
    });
    const entry = entries.find(e => e.path === 'props.rounded');
    expect(entry?.operation).toBe('added');
    expect(entry?.impact).toBe('minor');
    expect(entry?.concernFile).toBe('api.yaml');
    expect(bumpOf(entries)).toBe('minor');
  });

  it('grades any prop addition MINOR, default or not', () => {
    const { entries } = diffButton(doc => {
      doc.props.variantName = { type: 'string' };
    });
    const entry = entries.find(e => e.path === 'props.variantName');
    expect(entry?.impact).toBe('minor');
    expect(entry?.flags).toContain('required');
  });

  it('grades a prop removal MAJOR', () => {
    const { entries } = diffButton(doc => {
      delete doc.props.startIconVisible;
    });
    const entry = entries.find(e => e.path === 'props.startIconVisible' && e.operation === 'removed');
    expect(entry?.impact).toBe('major');
  });

  it('grades enum value added MINOR and removed MAJOR', () => {
    const { entries } = diffButton(doc => {
      doc.props.appearance.enum = ['Filled', 'Outline', 'Ghost']; // Text removed, Ghost added
    });
    const added = entries.find(e => e.path === 'props.appearance.enum' && e.operation === 'added');
    const removed = entries.find(e => e.path === 'props.appearance.enum' && e.operation === 'removed');
    expect(added?.newValue).toBe('Ghost');
    expect(added?.impact).toBe('minor');
    expect(removed?.oldValue).toBe('Text');
    expect(removed?.impact).toBe('major');
    expect(bumpOf(entries)).toBe('major');
  });

  it('grades an enum reorder PATCH', () => {
    const { entries } = diffButton(doc => {
      doc.props.appearance.enum = ['Text', 'Filled', 'Outline'];
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe('reordered');
    expect(entries[0].impact).toBe('patch');
  });

  it('grades a default change MAJOR', () => {
    const { entries } = diffButton(doc => {
      doc.props.appearance.default = 'Outline';
    });
    const entry = entries.find(e => e.path === 'props.appearance.default');
    expect(entry?.impact).toBe('major');
    expect(entry?.oldValue).toBe('Filled');
    expect(entry?.newValue).toBe('Outline');
  });

  it('grades a nullable move MAJOR in either direction', () => {
    const loosened = diffButton(doc => { doc.props.appearance.nullable = true; });
    expect(loosened.entries.find(e => e.path === 'props.appearance.nullable')?.impact).toBe('major');

    const scratch = makeWorkspace('diff-nullable');
    try {
      editYaml(scratch, 'specs/deAlert/api.yaml', doc => { doc.props.icon.nullable = false; });
      const base = assemble(path.join(baseDir, 'specs'), 'deAlert');
      const current = assemble(path.join(scratch, 'specs'), 'deAlert');
      const { entries } = diffComponent(base, current, { ruleSet, renames: noRenames });
      expect(entries.find(e => e.path === 'props.icon.nullable')?.impact).toBe('major');
    } finally {
      removeWorkspace(scratch);
    }

    // the prop carrying it is still just a prop arriving
    const added = diffButton(doc => { doc.props.icon = { type: 'string', nullable: true }; });
    expect(added.entries.find(e => e.path === 'props.icon')?.impact).toBe('minor');
  });

  it('ignores slot anyOf while it is derived from key resolution', () => {
    const slotOnly = makeWorkspace('diff-anyof-base');
    const withAnyOf = makeWorkspace('diff-anyof-current');
    try {
      editYaml(slotOnly, 'specs/deButton/api.yaml', doc => {
        doc.props.children = { type: 'slot', nullable: true };
      });
      editYaml(withAnyOf, 'specs/deButton/api.yaml', doc => {
        doc.props.children = { type: 'slot', nullable: true, anyOf: ['deIcon', 'deBadge'] };
      });
      const base = assemble(path.join(slotOnly, 'specs'), 'deButton');
      const wide = assemble(path.join(withAnyOf, 'specs'), 'deButton');

      for (const { entries } of [
        diffComponent(base, wide, { ruleSet, renames: noRenames }),
        diffComponent(wide, base, { ruleSet, renames: noRenames }),
      ]) {
        const entry = entries.find(e => e.path === 'props.children.anyOf');
        expect(entry?.impact).toBe('ignore');
        expect(bumpOf(entries)).toBe('none');
      }
    } finally {
      removeWorkspace(slotOnly);
      removeWorkspace(withAnyOf);
    }
  });

  it('grades anatomy element add MINOR, remove MAJOR, role change MAJOR, role add MINOR', () => {
    const added = diffButton(doc => { doc.anatomy.endIcon = { type: 'glyph' }; });
    expect(added.entries.find(e => e.path === 'anatomy.endIcon')?.impact).toBe('minor');

    const removed = diffButton(doc => { delete doc.anatomy.focusRing; });
    expect(removed.entries.find(e => e.path === 'anatomy.focusRing')?.impact).toBe('major');

    const roleChanged = diffButton(doc => { doc.anatomy.root.role = 'link'; });
    expect(roleChanged.entries.find(e => e.path === 'anatomy.root.role')?.impact).toBe('major');

    const roleAdded = diffButton(doc => { doc.anatomy.startIcon.role = 'presentation'; });
    expect(roleAdded.entries.find(e => e.path === 'anatomy.startIcon.role')?.impact).toBe('minor');
  });

  it('grades invalidPropCombinations added MINOR / removed MAJOR, matched as a set', () => {
    const { entries } = diffButton(doc => {
      doc.invalidPropCombinations = [
        // original five, minus one, plus a new one, reordered
        { disabled: true, focus: true },
        { state: 'Hover', focus: true },
        { disabled: true, state: 'Hover' },
        { disabled: true, state: 'Pressed' },
        { size: 'Large', appearance: 'Text' },
      ];
    });
    const added = entries.filter(e => e.path === 'invalidPropCombinations' && e.operation === 'added');
    const removed = entries.filter(e => e.path === 'invalidPropCombinations' && e.operation === 'removed');
    expect(added).toHaveLength(1);
    expect(added[0].impact).toBe('minor');
    expect(removed).toHaveLength(1);
    expect(removed[0].impact).toBe('major');
    expect(entries).toHaveLength(2); // reorder of surviving members is not a finding
  });

  it('grades a subcomponent removal MAJOR and a nested prop change at its own rule', () => {
    const scratch = makeWorkspace('diff-sub');
    try {
      editYaml(scratch, 'specs/deAlert/api.yaml', doc => {
        doc.subcomponents.actions.props.children.maxChildren = 3;
      });
      const base = assemble(path.join(baseDir, 'specs'), 'deAlert');
      const current = assemble(path.join(scratch, 'specs'), 'deAlert');
      const { entries } = diffComponent(base, current, { ruleSet, renames: noRenames });
      const entry = entries.find(e => e.path === 'subcomponents.actions.props.children.maxChildren');
      expect(entry).toBeDefined();

      editYaml(scratch, 'specs/deAlert/api.yaml', doc => { delete doc.subcomponents.actions; });
      const removedResult = diffComponent(base, assemble(path.join(scratch, 'specs'), 'deAlert'), { ruleSet, renames: noRenames });
      expect(removedResult.entries.find(e => e.path === 'subcomponents.actions')?.impact).toBe('major');
    } finally {
      removeWorkspace(scratch);
    }
  });

  it('ignores metadata.lastUpdated and nodeId; grades pageId PATCH', () => {
    const { entries } = diffButton(doc => {
      doc.metadata.lastUpdated = '2027-01-01T00:00:00.000Z';
      doc.metadata.source.nodeId = '9999:1';
      doc.metadata.source.pageId = '8888:1';
    });
    expect(entries.find(e => e.path === 'metadata.lastUpdated')?.impact).toBe('ignore');
    expect(entries.find(e => e.path === 'metadata.source.nodeId')?.impact).toBe('ignore');
    expect(entries.find(e => e.path === 'metadata.source.pageId')?.impact).toBe('patch');
    expect(bumpOf(entries)).toBe('patch');
  });

  it('flags an untracked title change as a warning', () => {
    const { entries, warnings } = diffButton(doc => { doc.title = 'DE Push Button'; });
    // The edit itself is content; recording it in renames.yaml is the identity question.
    expect(entries.find(e => e.path === 'title')?.impact).toBe('patch');
    expect(warnings.some(w => w.includes('renames.yaml'))).toBe(true);
  });
});

describe('diff engine — variants.yaml can never exceed PATCH', () => {
  it('grades style, content, and binding changes PATCH', () => {
    const { entries } = diffButton(doc => {
      doc.default.elements.root.styles.height = 32;
      doc.default.elements.startIcon.content = 'minus';
      doc.default.elements.startIcon.styles.visible = { $binding: '#/props/disabled' };
    }, 'variants');
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.concernFile).toBe('variants.yaml');
      expect(['patch', 'ignore']).toContain(entry.impact);
    }
    expect(bumpOf(entries)).toBe('patch');
  });

  it('matches variants by configuration, not index, and grades add/remove PATCH', () => {
    const { entries } = diffButton(doc => {
      doc.variants = doc.variants.filter((v: any) => JSON.stringify(v.configuration) !== JSON.stringify({ focus: true }));
      doc.variants.unshift({ configuration: { state: 'Loading' }, elements: { root: { styles: { opacity: 0.5 } } } });
    }, 'variants');
    const removed = entries.find(e => e.operation === 'removed' && e.path.startsWith('variants['));
    const added = entries.find(e => e.operation === 'added' && e.path.startsWith('variants['));
    expect(removed?.path).toContain('focus=true');
    expect(added?.path).toContain('state="Loading"');
    for (const entry of entries) expect(['patch', 'ignore']).toContain(entry.impact);
    // survivors kept their relative order — the unshift is an insertion, not a reorder
    expect(bumpOf(entries)).toBe('patch');
  });

  it('emits a single ignored reorder entry when only positions change', () => {
    const { entries } = diffButton(doc => {
      doc.variants = [...doc.variants].reverse();
    }, 'variants');
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe('reordered');
    expect(entries[0].impact).toBe('ignore');
  });
});

describe('diff engine — rename-aware matching', () => {
  const renames = buildRenameMap([
    { kind: 'rename', scope: 'deButton.props', from: 'size', to: 'scale' },
    { kind: 'rename', scope: 'deButton.props.state.enum', from: 'Rest', to: 'Default' },
    { kind: 'rename', scope: 'deButton', from: 'DE Button', to: 'DE Push Button' },
  ]);

  function diffRenamed(edit: (doc: any) => void) {
    const scratch = makeWorkspace('diff-rename');
    try {
      editYaml(scratch, 'specs/deButton/api.yaml', edit);
      const base = assemble(path.join(baseDir, 'specs'), 'deButton');
      const current = assemble(path.join(scratch, 'specs'), 'deButton');
      return diffComponent(base, current, { ruleSet, renames });
    } finally {
      removeWorkspace(scratch);
    }
  }

  it('diffs a tracked prop rename as one rename, never remove+add', () => {
    const { entries } = diffRenamed(doc => {
      const def = doc.props.size;
      delete doc.props.size;
      doc.props.scale = def;
    });
    const renamedEntries = entries.filter(e => e.operation === 'renamed');
    expect(renamedEntries).toHaveLength(1);
    expect(renamedEntries[0].path).toBe('props.size');
    expect(renamedEntries[0].newValue).toBe('scale');
    expect(renamedEntries[0].impact).toBe('major');
    expect(entries.filter(e => e.operation === 'removed')).toHaveLength(0);
    expect(entries.filter(e => e.operation === 'added')).toHaveLength(0);
  });

  it('diffs a tracked enum value rename as one rename', () => {
    const { entries } = diffRenamed(doc => {
      doc.props.state.enum = ['Default', 'Hover', 'Pressed'];
      doc.props.state.default = 'Default';
    });
    const renamed = entries.find(e => e.operation === 'renamed' && e.path === 'props.state.enum');
    expect(renamed?.oldValue).toBe('Rest');
    expect(renamed?.newValue).toBe('Default');
    expect(renamed?.impact).toBe('major');
    // the default change is still its own (major) finding
    expect(entries.find(e => e.path === 'props.state.default')?.impact).toBe('major');
  });

  it('diffs a tracked component title rename as a rename with no untracked warning', () => {
    const { entries, warnings } = diffRenamed(doc => { doc.title = 'DE Push Button'; });
    const title = entries.find(e => e.path === 'title');
    expect(title?.operation).toBe('renamed');
    expect(title?.impact).toBe('major');
    expect(warnings).toHaveLength(0);
  });

  it('falls through to remove+add for untracked renames', () => {
    const untracked = emptyRenameMap();
    const scratch = makeWorkspace('diff-untracked');
    try {
      editYaml(scratch, 'specs/deButton/api.yaml', doc => {
        const def = doc.props.size;
        delete doc.props.size;
        doc.props.magnitude = def;
      });
      const base = assemble(path.join(baseDir, 'specs'), 'deButton');
      const current = assemble(path.join(scratch, 'specs'), 'deButton');
      const { entries } = diffComponent(base, current, { ruleSet, renames: untracked });
      expect(entries.find(e => e.operation === 'removed' && e.path === 'props.size')).toBeDefined();
      expect(entries.find(e => e.operation === 'added' && e.path === 'props.magnitude')).toBeDefined();
    } finally {
      removeWorkspace(scratch);
    }
  });
});

describe('diff engine — object-prop members (ADR-111)', () => {
  const MARGIN = {
    type: 'object',
    members: {
      compact: { type: 'string', default: 'None', enum: ['None', 'Tight'], nullable: false },
      expanded: { type: 'string', default: 'Loose', enum: ['None', 'Loose'], nullable: false },
    },
  };

  /** Diff two scratch workspaces whose api.yaml both carry the object prop, then diverge. */
  function diffMembers(currentEdit: (doc: any) => void): { entries: DiffEntry[] } { // eslint-disable-line @typescript-eslint/no-explicit-any
    const baseScratch = makeWorkspace('diff-member-base');
    const currentScratch = makeWorkspace('diff-member-current');
    try {
      editYaml(baseScratch, 'specs/deButton/api.yaml', doc => { doc.props.margin = structuredClone(MARGIN); });
      editYaml(currentScratch, 'specs/deButton/api.yaml', doc => {
        doc.props.margin = structuredClone(MARGIN);
        currentEdit(doc);
      });
      const base = assemble(path.join(baseScratch, 'specs'), 'deButton');
      const current = assemble(path.join(currentScratch, 'specs'), 'deButton');
      return diffComponent(base, current, { ruleSet, renames: noRenames });
    } finally {
      removeWorkspace(baseScratch);
      removeWorkspace(currentScratch);
    }
  }

  it('grades a member removal MAJOR, not documentation', () => {
    const { entries } = diffMembers(doc => { delete doc.props.margin.members.expanded; });
    const entry = entries.find(e => e.path === 'props.margin.members.expanded' && e.operation === 'removed');
    expect(entry?.impact).toBe('major');
    expect(bumpOf(entries)).toBe('major');
  });

  it('grades a member addition MINOR', () => {
    const { entries } = diffMembers(doc => {
      doc.props.margin.members.emphasized = { type: 'boolean', default: false };
    });
    const entry = entries.find(e => e.path === 'props.margin.members.emphasized' && e.operation === 'added');
    expect(entry?.impact).toBe('minor');
  });

  it('grades a member type change MAJOR', () => {
    const { entries } = diffMembers(doc => {
      doc.props.margin.members.compact = { type: 'boolean', default: false };
    });
    const entry = entries.find(e => e.path === 'props.margin.members.compact.type');
    expect(entry?.impact).toBe('major');
  });

  it('grades a member enum value removal MAJOR', () => {
    const { entries } = diffMembers(doc => {
      doc.props.margin.members.compact.enum = ['None'];
    });
    const entry = entries.find(e => e.path === 'props.margin.members.compact.enum' && e.operation === 'removed');
    expect(entry?.impact).toBe('major');
  });

  it('validates configured member keys and member enum values against the declaration', () => {
    const scratch = makeWorkspace('diff-member-orphan');
    try {
      editYaml(scratch, 'specs/deButton/api.yaml', doc => { doc.props.margin = structuredClone(MARGIN); });
      editYaml(scratch, 'specs/deButton/variants.yaml', doc => {
        doc.variants.push({ configuration: { margin: { compact: 'Tight', vanished: 'x' } }, elements: {} });
        doc.variants.push({ configuration: { margin: { expanded: 'NotAValue' } }, elements: {} });
      });
      const orphans = findOrphans(assemble(path.join(scratch, 'specs'), 'deButton'));
      expect(orphans.some(o => o.includes('margin.vanished'))).toBe(true);
      expect(orphans.some(o => o.includes('expanded: NotAValue'))).toBe(true);
    } finally {
      removeWorkspace(scratch);
    }
  });

  it('finds a dangling member binding pointer', () => {
    const scratch = makeWorkspace('diff-member-binding');
    try {
      editYaml(scratch, 'specs/deButton/api.yaml', doc => { doc.props.margin = structuredClone(MARGIN); });
      editYaml(scratch, 'specs/deButton/variants.yaml', doc => {
        doc.default.elements.label = { content: { $binding: '#/props/margin/members/vanished' } };
      });
      const orphans = findOrphans(assemble(path.join(scratch, 'specs'), 'deButton'));
      expect(orphans.some(o => o.includes('props.margin.members.vanished'))).toBe(true);
    } finally {
      removeWorkspace(scratch);
    }
  });
});

describe('diff engine — orphan cross-check', () => {
  it('attaches orphaned variant configurations to the api-side removal', () => {
    const scratch = makeWorkspace('diff-orphan');
    try {
      editYaml(scratch, 'specs/deButton/api.yaml', doc => { delete doc.props.focus; });
      const base = assemble(path.join(baseDir, 'specs'), 'deButton');
      const current = assemble(path.join(scratch, 'specs'), 'deButton');
      const { entries, warnings } = diffComponent(base, current, { ruleSet, renames: noRenames });
      const removal = entries.find(e => e.path === 'props.focus' && e.operation === 'removed');
      expect(removal?.impact).toBe('major');
      expect(removal?.defects?.length).toBeGreaterThan(0);
      expect(removal?.defects?.some(d => d.includes('focus'))).toBe(true);
      expect(warnings.some(w => w.startsWith('Orphan:'))).toBe(true);
    } finally {
      removeWorkspace(scratch);
    }
  });

  it('finds dangling $binding targets', () => {
    const scratch = makeWorkspace('diff-binding');
    try {
      editYaml(scratch, 'specs/deButton/api.yaml', doc => { delete doc.props.startIconVisible; });
      const current = assemble(path.join(scratch, 'specs'), 'deButton');
      const orphans = findOrphans(current);
      expect(orphans.some(o => o.includes('#/props/startIconVisible'))).toBe(true);
    } finally {
      removeWorkspace(scratch);
    }
  });
});

describe('diff engine — run metadata (once per run)', () => {
  it('grades a generator upgrade PATCH and a schema MAJOR as major', () => {
    const patch = diffRun({ generatorVersion: '0.30.0', schemaVersion: '0.34.0' }, { generatorVersion: '0.31.0', schemaVersion: '0.34.0' }, ruleSet);
    expect(patch).toHaveLength(1);
    expect(patch[0].impact).toBe('patch');

    const major = diffRun({ schemaVersion: '0.34.0' }, { schemaVersion: '1.0.0' }, ruleSet);
    expect(major.find(e => e.path === 'schema.version')?.impact).toBe('major');

    const minor = diffRun({ schemaVersion: '0.34.0' }, { schemaVersion: '0.35.0' }, ruleSet);
    expect(minor.find(e => e.path === 'schema.version')?.impact).toBe('patch');
  });
});
