import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { resolveWorkspace } from '../../../src/version/assemble.js';
import { planCut, commitCut } from '../../../src/version/ledger/cut.js';
import {
  readComponentLedger,
  readLibraryLedger,
  specPathAtVersion,
  ledgeredComponents,
} from '../../../src/version/ledger/store.js';
import { loadRules } from '../../../src/version/rules/grade.js';
import { makeWorkspace, removeWorkspace, editYaml, writeYaml, writeAsset } from './helpers.js';

const ruleSet = loadRules();
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) removeWorkspace(dirs.pop()!);
});

function workspace(name: string): string {
  const dir = makeWorkspace(name);
  dirs.push(dir);
  return dir;
}

function cut(dir: string, override: { class: 'major' | 'minor' | 'patch'; reason: string } | null = null) {
  const ws = resolveWorkspace(dir);
  const plan = planCut(ws, ruleSet, override);
  if (plan.fatal.length === 0 && !(plan.noChanges && !plan.initialized)) {
    commitCut(ws, plan, { reportMd: '# report\n', changelogMd: '# changelog\n' });
  }
  return plan;
}

describe('cut — initialization', () => {
  it('initializes every component at 0.1.0 and the library at 0.1.0', () => {
    const dir = workspace('init');
    const plan = cut(dir);

    expect(plan.initialized).toBe(true);
    expect(plan.libraryVersion).toBe('0.1.0');

    const library = readLibraryLedger(path.join(dir, 'versions'))!;
    expect(library.versions).toHaveLength(1);
    expect(library.versions[0].version).toBe('0.1.0');
    expect(library.versions[0].changeType).toBe('initial');
    expect(library.versions[0].reason).toBe('Initial version baseline');

    expect(ledgeredComponents(path.join(dir, 'versions')).sort()).toEqual(['deAlert', 'deButton']);
    const button = readComponentLedger(path.join(dir, 'versions'), 'deButton')!;
    expect(button.versions[0].version).toBe('0.1.0');
    expect(button.versions[0].changeType).toBe('initial');
    expect(button.versions[0].run.schemaVersion).toBe('0.34.0');

    // version folder + latest, with the full spec tree
    expect(fs.existsSync(path.join(dir, 'versions/0.1.0/specs/deButton/api.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'versions/0.1.0/report.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'versions/0.1.0/changelog.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'versions/latest/specs/deButton/api.yaml'))).toBe(true);
  });

  it('is a no-op when nothing changed since the last version', () => {
    const dir = workspace('noop');
    cut(dir);
    const second = cut(dir);
    expect(second.noChanges).toBe(true);
    expect(readLibraryLedger(path.join(dir, 'versions'))!.versions).toHaveLength(1);
  });
});

describe('cut — classification drives version movement', () => {
  it('moves a component MINOR and the library MINOR on an optional prop addition', () => {
    const dir = workspace('minor');
    cut(dir);
    editYaml(dir, 'specs/deButton/api.yaml', doc => {
      doc.props.rounded = { type: 'boolean', default: false };
    });
    const plan = cut(dir);

    expect(plan.libraryFrom).toBe('0.1.0');
    expect(plan.libraryVersion).toBe('0.2.0');
    expect(plan.libraryBump).toBe('minor');

    const button = readComponentLedger(path.join(dir, 'versions'), 'deButton')!;
    expect(button.versions.map(v => v.version)).toEqual(['0.1.0', '0.2.0']);
    expect(button.versions[1].changeType).toBe('minor');
    expect(button.versions[1].libraryVersion).toBe('0.2.0');
    expect(button.versions[1].diff.some(e => e.path === 'props.rounded')).toBe(true);

    // unchanged component gets no new entry
    const alert = readComponentLedger(path.join(dir, 'versions'), 'deAlert')!;
    expect(alert.versions).toHaveLength(1);

    // the new version folder holds the changed tree; latest/ was refreshed
    expect(fs.existsSync(path.join(dir, 'versions/0.2.0/specs/deButton/api.yaml'))).toBe(true);
    const latestApi = fs.readFileSync(path.join(dir, 'versions/latest/specs/deButton/api.yaml'), 'utf8');
    expect(latestApi).toContain('rounded');
  });

  it('goes MAJOR on a prop removal; variants-only changes stay PATCH', () => {
    const dir = workspace('classes');
    cut(dir);
    editYaml(dir, 'specs/deButton/api.yaml', doc => { delete doc.props.startIconVisible; });
    editYaml(dir, 'specs/deButton/variants.yaml', doc => {
      delete doc.default.elements.startIcon.styles.visible; // avoid a dangling binding
      doc.default.elements.root.styles.height = 40;
    });
    editYaml(dir, 'specs/deAlert/variants.yaml', doc => {
      doc.default.elements.root.styles.itemSpacing = 12;
    });
    const plan = cut(dir);

    expect(plan.libraryVersion).toBe('1.0.0');
    const button = plan.components.find(c => c.name === 'deButton')!;
    const alert = plan.components.find(c => c.name === 'deAlert')!;
    expect(button.changeType).toBe('major');
    expect(button.to).toBe('1.0.0');
    expect(alert.changeType).toBe('patch');
    expect(alert.to).toBe('0.1.1');
  });

  it('tracks removed and added components', () => {
    const dir = workspace('addremove');
    cut(dir);
    fs.removeSync(path.join(dir, 'specs/deAlert'));
    fs.copySync(path.join(dir, 'specs/deButton'), path.join(dir, 'specs/deChip'));
    editYaml(dir, 'specs/deChip/api.yaml', doc => {
      doc.title = 'DE Chip';
      doc.metadata.source.nodeId = '7777:1';
    });
    const plan = cut(dir);

    expect(plan.libraryVersion).toBe('1.0.0'); // removal is major
    const removed = plan.components.find(c => c.name === 'deAlert')!;
    const added = plan.components.find(c => c.name === 'deChip')!;
    expect(removed.changeType).toBe('removed');
    expect(added.changeType).toBe('initial');
    expect(added.to).toBe('0.1.0');

    const chip = readComponentLedger(path.join(dir, 'versions'), 'deChip')!;
    expect(chip.versions[0].version).toBe('0.1.0');
  });
});

describe('cut — identity', () => {
  it('continues history through a tracked component rename', () => {
    const dir = workspace('rename');
    cut(dir);
    fs.moveSync(path.join(dir, 'specs/deButton'), path.join(dir, 'specs/dePushButton'));
    editYaml(dir, 'specs/dePushButton/api.yaml', doc => { doc.title = 'DE Push Button'; });
    writeYaml(dir, 'versions/renames.yaml', {
      events: [{
        at: '2026-09-20', kind: 'rename', scope: 'deButton',
        from: 'DE Button', to: 'DE Push Button', reason: 'test',
      }],
    });
    const plan = cut(dir);

    const renamed = plan.components.find(c => c.name === 'dePushButton')!;
    expect(renamed.presence).toBe('renamed');
    expect(renamed.previousTitle).toBe('DE Button');
    expect(renamed.changeType).toBe('major');
    expect(renamed.from).toBe('0.1.0');
    expect(renamed.to).toBe('1.0.0');

    // ledger file moved, history intact
    expect(readComponentLedger(path.join(dir, 'versions'), 'deButton')).toBeNull();
    const ledger = readComponentLedger(path.join(dir, 'versions'), 'dePushButton')!;
    expect(ledger.versions).toHaveLength(2);
    expect(ledger.component.title).toBe('DE Push Button');
    expect(plan.renames[0]).toMatchObject({ from: 'DE Button', to: 'DE Push Button', provenance: 'recorded' });
  });

  it('fails the cut on an untracked title change with matching nodeId (likely rename)', () => {
    const dir = workspace('likely');
    cut(dir);
    fs.moveSync(path.join(dir, 'specs/deButton'), path.join(dir, 'specs/deCta'));
    editYaml(dir, 'specs/deCta/api.yaml', doc => { doc.title = 'DE Cta'; });
    const plan = cut(dir);

    expect(plan.fatal.some(w => w.includes('Likely rename'))).toBe(true);
    expect(plan.renames[0]).toMatchObject({ provenance: 'inferred' });
    // nothing was written
    expect(readLibraryLedger(path.join(dir, 'versions'))!.versions).toHaveLength(1);
    expect(readComponentLedger(path.join(dir, 'versions'), 'deCta')).toBeNull();

    // a --force override proceeds, recording removal + addition
    const forced = cut(dir, { class: 'major', reason: 'confirmed: genuinely a new component' });
    expect(forced.fatal).toHaveLength(0);
    expect(forced.warnings.some(w => w.includes('Likely rename'))).toBe(true);
    expect(forced.components.find(c => c.name === 'deButton')?.changeType).toBe('removed');
    expect(forced.components.find(c => c.name === 'deCta')?.changeType).toBe('initial');
  });
});

describe('cut — assets', () => {
  it('grades asset added MINOR, unreferenced removal PATCH, and content change PATCH', () => {
    const dir = workspace('assets');
    writeAsset(dir, 'icons/unused.svg', '<svg>1</svg>');
    writeAsset(dir, 'icons/plus.svg', '<svg>plus</svg>'); // referenced by deButton startIcon content
    cut(dir);

    fs.removeSync(path.join(dir, 'assets/icons/unused.svg'));
    writeAsset(dir, 'icons/plus.svg', '<svg>plus-v2</svg>');
    writeAsset(dir, 'icons/sparkle.svg', '<svg>sparkle</svg>');
    const plan = cut(dir);

    const byPath = Object.fromEntries(plan.assetEntries.map(e => [e.path, e]));
    expect(byPath['icons/sparkle.svg'].impact).toBe('minor');
    expect(byPath['icons/unused.svg'].impact).toBe('patch');
    expect(byPath['icons/unused.svg'].flags).toContain('unreferenced');
    expect(byPath['icons/plus.svg'].impact).toBe('patch');
    expect(plan.libraryVersion).toBe('0.2.0');

    // assets live only in latest/, never in the version folders
    expect(fs.existsSync(path.join(dir, 'versions/latest/assets/icons/sparkle.svg'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'versions/0.2.0/assets'))).toBe(false);
  });

  it('fails the run when an asset is removed while a spec still references it', () => {
    const dir = workspace('asset-fatal');
    writeAsset(dir, 'icons/plus.svg', '<svg>plus</svg>');
    cut(dir);
    fs.removeSync(path.join(dir, 'assets/icons/plus.svg'));
    const plan = cut(dir);

    expect(plan.fatal.some(f => f.includes('icons/plus.svg'))).toBe(true);
    // nothing was written
    expect(readLibraryLedger(path.join(dir, 'versions'))!.versions).toHaveLength(1);
  });

  it('a --force override records the defect and proceeds', () => {
    const dir = workspace('asset-forced');
    writeAsset(dir, 'icons/plus.svg', '<svg>plus</svg>');
    cut(dir);
    fs.removeSync(path.join(dir, 'assets/icons/plus.svg'));
    const plan = cut(dir, { class: 'major', reason: 'icon retired deliberately' });

    expect(plan.fatal).toHaveLength(0);
    expect(plan.warnings.some(w => w.includes('icons/plus.svg'))).toBe(true);
    expect(plan.libraryVersion).toBe('1.0.0');
    const library = readLibraryLedger(path.join(dir, 'versions'))!;
    expect(library.versions[1].override).toEqual({ class: 'major', reason: 'icon retired deliberately' });
  });
});

describe('cut — manual overrides', () => {
  it('records --force-minor on a variants-only change and cuts accordingly', () => {
    const dir = workspace('force');
    cut(dir);
    editYaml(dir, 'specs/deButton/variants.yaml', doc => {
      doc.default.elements.root.styles.backgroundColor = { $token: 'DE Color/Action/Loud', $type: 'color' };
    });
    const plan = cut(dir, { class: 'minor', reason: 'visual break' });

    expect(plan.libraryVersion).toBe('0.2.0');
    const button = readComponentLedger(path.join(dir, 'versions'), 'deButton')!;
    expect(button.versions[1].version).toBe('0.2.0');
    expect(button.versions[1].changeType).toBe('minor');
    expect(button.versions[1].override).toEqual({ class: 'minor', reason: 'visual break' });
  });
});

describe('restore path — specPathAtVersion', () => {
  it('resolves a component version to the library folder that shipped it', () => {
    const dir = workspace('restore');
    cut(dir);
    editYaml(dir, 'specs/deButton/api.yaml', doc => {
      doc.props.rounded = { type: 'boolean', default: false };
    });
    cut(dir);

    const versionsDir = path.join(dir, 'versions');
    const ledger = readComponentLedger(versionsDir, 'deButton')!;

    const v1 = specPathAtVersion(versionsDir, ledger, 'deButton', '0.1.0');
    expect(v1.entry.libraryVersion).toBe('0.1.0');
    expect(fs.readFileSync(path.join(v1.dir, 'api.yaml'), 'utf8')).not.toContain('rounded');

    const v11 = specPathAtVersion(versionsDir, ledger, 'deButton', '0.2.0');
    expect(v11.entry.libraryVersion).toBe('0.2.0');
    expect(fs.readFileSync(path.join(v11.dir, 'api.yaml'), 'utf8')).toContain('rounded');

    expect(() => specPathAtVersion(versionsDir, ledger, 'deButton', '9.9.9')).toThrow(/not found/);
  });
});
