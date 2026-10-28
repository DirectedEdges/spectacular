/**
 * Version storage under `<workspace>/versions/` — library-level version folders
 * plus machine-managed JSON ledgers:
 *
 *   versions/
 *   ├── latest/              full copy of the most recent version folder,
 *   │                        plus assets/ (kept only here, never per version)
 *   ├── 1.0.0/               one folder per LIBRARY version:
 *   │   ├── report.md        the release report generated for that version
 *   │   ├── changelog.md     the itemized changelog for that version
 *   │   └── specs/           the full spec tree exactly as versioned
 *   ├── ledgers/             library.ledger.json + <Component>.ledger.json
 *   └── renames.yaml         human-facing identity events (hand-edited)
 *
 * The version folders are the authoritative full-content store; ledgers keep the
 * classified diffs (history queries, changelogs) and the run/git metadata. There
 * is no snapshot-and-replay machinery — restore reads a version folder directly.
 */

import * as fs from 'fs';
import * as path from 'path';
import { compareVersions } from '../rules/grade.js';
import type {
  ComponentLedger,
  ComponentLedgerEntry,
  LibraryLedger,
  LibraryLedgerEntry,
} from '../types.js';

// ---------------------------------------------------------------- paths

export function ledgersDir(versionsDir: string): string {
  return path.join(versionsDir, 'ledgers');
}

export function componentLedgerPath(versionsDir: string, name: string): string {
  return path.join(ledgersDir(versionsDir), `${name}.ledger.json`);
}

export function libraryLedgerPath(versionsDir: string): string {
  return path.join(ledgersDir(versionsDir), 'library.ledger.json');
}

export function versionFolder(versionsDir: string, libraryVersion: string): string {
  return path.join(versionsDir, libraryVersion);
}

export function latestFolder(versionsDir: string): string {
  return path.join(versionsDir, 'latest');
}

// ---------------------------------------------------------------- ledgers

export function readComponentLedger(versionsDir: string, name: string): ComponentLedger | null {
  const file = componentLedgerPath(versionsDir, name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ComponentLedger;
}

export function readLibraryLedger(versionsDir: string): LibraryLedger | null {
  const file = libraryLedgerPath(versionsDir);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as LibraryLedger;
}

export function writeComponentLedger(versionsDir: string, name: string, ledger: ComponentLedger): void {
  fs.mkdirSync(ledgersDir(versionsDir), { recursive: true });
  fs.writeFileSync(componentLedgerPath(versionsDir, name), `${JSON.stringify(ledger, null, 2)}\n`);
}

export function writeLibraryLedger(versionsDir: string, ledger: LibraryLedger): void {
  fs.mkdirSync(ledgersDir(versionsDir), { recursive: true });
  fs.writeFileSync(libraryLedgerPath(versionsDir), `${JSON.stringify(ledger, null, 2)}\n`);
}

/** On component rename: history continues under the new name. */
export function renameComponentLedger(versionsDir: string, oldName: string, newName: string): void {
  const from = componentLedgerPath(versionsDir, oldName);
  const to = componentLedgerPath(versionsDir, newName);
  if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
}

/** Every component that has a ledger file. */
export function ledgeredComponents(versionsDir: string): string[] {
  const dir = ledgersDir(versionsDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.ledger.json') && f !== 'library.ledger.json')
    .map(f => f.replace(/\.ledger\.json$/, ''))
    .sort();
}

export function latestVersionOf(ledger: ComponentLedger): ComponentLedgerEntry | null {
  return ledger.versions.length > 0 ? ledger.versions[ledger.versions.length - 1] : null;
}

export function latestLibraryVersion(ledger: LibraryLedger): LibraryLedgerEntry | null {
  return ledger.versions.length > 0 ? ledger.versions[ledger.versions.length - 1] : null;
}

/** Entries within an inclusive version range, oldest first. */
export function entriesInRange(ledger: ComponentLedger, from?: string, to?: string): ComponentLedgerEntry[] {
  return ledger.versions.filter(v =>
    (!from || compareVersions(v.version, from) >= 0) && (!to || compareVersions(v.version, to) <= 0));
}

/**
 * The spec folder for a component at one of its ledgered versions: the entry
 * names the library version that shipped it; the spec is read straight out of
 * that version folder. No diff replay.
 */
export function specPathAtVersion(
  versionsDir: string,
  ledger: ComponentLedger,
  name: string,
  version: string,
): { dir: string; entry: ComponentLedgerEntry } {
  const entry = ledger.versions.find(v => v.version === version);
  if (!entry) {
    throw new Error(
      `Version ${version} not found for ${ledger.component.title} ` +
      `(has: ${ledger.versions.map(v => v.version).join(', ')})`,
    );
  }
  const dir = path.join(versionFolder(versionsDir, entry.libraryVersion), 'specs', name);
  if (!fs.existsSync(dir)) {
    throw new Error(`Version folder missing: ${dir} — the versions/ store is incomplete`);
  }
  return { dir, entry };
}

/**
 * The annotated tag message for a ledgered library version: the per-component
 * roll-up recorded at cut time.
 */
export function tagMessageFor(versionsDir: string, entry: LibraryLedgerEntry): string {
  const lines = [`Release ${entry.version}`, ''];
  for (const [name, movement] of Object.entries(entry.components)) {
    const title = readComponentLedger(versionsDir, name)?.component.title ?? name;
    lines.push(`${title}: ${movement.from ?? 'new'} -> ${movement.to} (${movement.changeType})`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- version folders

/** Recursive copy that tolerates a missing source. */
export function copyTree(from: string, to: string): void {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

/**
 * Write a new `versions/<libraryVersion>/` folder from the workspace's specs
 * tree, then refresh `latest/` as a copy of it — latest/ additionally carries
 * assets/, which is kept only there (too expensive per version).
 */
export function writeVersionFolder(options: {
  versionsDir: string;
  libraryVersion: string;
  specsDir: string;
  assetsDir: string;
  reportMd: string;
  changelogMd: string;
}): string {
  const folder = versionFolder(options.versionsDir, options.libraryVersion);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  copyTree(options.specsDir, path.join(folder, 'specs'));
  fs.writeFileSync(path.join(folder, 'report.md'), options.reportMd);
  fs.writeFileSync(path.join(folder, 'changelog.md'), options.changelogMd);

  const latest = latestFolder(options.versionsDir);
  fs.rmSync(latest, { recursive: true, force: true });
  copyTree(folder, latest);
  copyTree(options.assetsDir, path.join(latest, 'assets'));
  return folder;
}
