/**
 * Rename ledger (`versions/renames.yaml`) — explicit, human-confirmed identity
 * events at component, prop, and enum-value scope. The diff engine consults these
 * mappings before key-set comparison so a tracked rename diffs as one rename,
 * never as a removal plus an addition. Untracked renames fall through to
 * remove+add, which is the signal to record the event — never auto-recorded.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { slugify } from '../assemble.js';
import type { RenameEvent, RenameMap } from '../types.js';

export function emptyRenameMap(): RenameMap {
  return { components: [], props: new Map(), enums: new Map(), events: [] };
}

export function loadRenames(versionsDir: string): RenameMap {
  const file = path.join(versionsDir, 'renames.yaml');
  if (!fs.existsSync(file)) return emptyRenameMap();
  const doc = (yaml.parse(fs.readFileSync(file, 'utf8')) ?? {}) as { events?: RenameEvent[] };
  return buildRenameMap(doc.events ?? []);
}

/** Flatten events (including mass-rename mappings) into scope-keyed lookups. */
export function buildRenameMap(events: RenameEvent[]): RenameMap {
  const map = emptyRenameMap();
  map.events = events;

  const record = (scope: string, from: string, to: string, event: RenameEvent) => {
    const parts = scope.split('.');
    if (parts.length === 1) {
      map.components.push({ from, to, event });
      return;
    }
    if (parts[parts.length - 1] === 'props') {
      const component = parts.slice(0, -1).join('.');
      if (!map.props.has(component)) map.props.set(component, new Map());
      map.props.get(component)!.set(from, to);
      return;
    }
    if (parts[parts.length - 1] === 'enum') {
      // <component>.props.<prop>.enum
      const component = parts[0];
      const prop = parts[parts.length - 2];
      const key = `${component}.${prop}`;
      if (!map.enums.has(key)) map.enums.set(key, new Map());
      map.enums.get(key)!.set(from, to);
    }
  };

  for (const event of events) {
    if (event.kind !== 'rename') continue;
    if (event.mappings) {
      for (const m of event.mappings) record(m.scope, m.from, m.to, event);
      continue;
    }
    if (event.scope && event.from !== undefined && event.to !== undefined) {
      record(event.scope, event.from, event.to, event);
    }
  }
  return map;
}

/**
 * A recorded component rename matching `oldKey` → `newKey`. Titles and folder
 * names both match: the ledger example records titles under a folder-name scope,
 * so from/to are compared against the title and its slug on both sides.
 */
export function componentRename(
  map: RenameMap,
  old: { name: string; title: string },
  next: { name: string; title: string },
): RenameEvent | null {
  for (const { from, to, event } of map.components) {
    const fromMatches = from === old.title || from === old.name || slugify(from) === old.name;
    const toMatches = to === next.title || to === next.name || slugify(to) === next.name;
    if (fromMatches && toMatches) return event;
  }
  return null;
}

/** Prop rename map for one component (folder name or title). Empty map when none. */
export function propRenames(map: RenameMap, component: { name: string; title: string }): Map<string, string> {
  for (const [key, value] of map.props) {
    if (key === component.name || key === component.title || slugify(key) === component.name) return value;
  }
  return new Map();
}

/** Enum-value rename map for one prop of one component. */
export function enumRenames(map: RenameMap, component: { name: string; title: string }, prop: string): Map<string, string> {
  for (const [key, value] of map.enums) {
    const [c, p] = [key.slice(0, key.lastIndexOf('.')), key.slice(key.lastIndexOf('.') + 1)];
    if (p !== prop) continue;
    if (c === component.name || c === component.title || slugify(c) === component.name) return value;
  }
  return new Map();
}
