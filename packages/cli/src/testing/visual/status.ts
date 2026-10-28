// `specs testing visual status` — present, missing, or changed per shootable
// variant. "Changed" compares the capture record's node-subtree hash against
// the current manifest's: offline, free, exact per spec, and unmoved by
// edits elsewhere in the Figma file (specs#719). It is information and a
// scope for the overt `baseline` command — never a trigger; nothing here or
// anywhere else starts a capture on its own.
//
// Honesty bounds: the hash comes from the fetched payload, so status knows
// nothing about Figma edits that were never fetched — it states the
// payload's own fetch time instead of pretending. A capture made before
// hashes existed cannot be compared, so it reports as unhashed and is
// treated as current rather than forcing a bulk recapture.
import fs from 'fs-extra';
import path from 'path';
import type { VisualWorkspace } from './paths.js';
import { readJson, sanitizeNodeId } from './paths.js';
import { manifestEntries, type Manifest, type SpecKind } from './types.js';

export interface WorklistItem {
  kind: SpecKind;
  key: string;
  fileKey: string;
  nodeId: string;
  dest: string;
}

interface CaptureRecord {
  capturedAt?: string;
  nodeHash?: string | null;
  payloadFetchedAt?: string | null;
}

export interface Worklist {
  missing: WorklistItem[];
  /** Variants whose spec's subtree hash moved since capture. */
  changed: WorklistItem[];
  present: number;
  /** Specs captured before hashes existed — not comparable, treated as current. */
  unhashed: string[];
  /** Per kind/key capture provenance — what the report states, never a trigger. */
  provenance: Record<string, { capturedAt: string | null; payloadFetchedAt: string | null }>;
}

export function worklist(vw: VisualWorkspace, manifest: Manifest, only?: Set<string> | null): Worklist {
  const missing: WorklistItem[] = [];
  const changed: WorklistItem[] = [];
  const unhashed: string[] = [];
  const provenance: Worklist['provenance'] = {};
  let present = 0;

  for (const [kind, key, entry] of manifestEntries(manifest, only)) {
    const dir = vw.dirFor('figma', kind, key);
    const capturePath = path.join(dir, '.capture.json');
    const capture: CaptureRecord | null = fs.existsSync(capturePath)
      ? readJson<CaptureRecord>(capturePath)
      : null;
    provenance[`${kind}/${key}`] = {
      capturedAt: capture?.capturedAt ?? null,
      payloadFetchedAt: capture?.payloadFetchedAt ?? null,
    };
    const specChanged =
      capture != null && capture.nodeHash != null && entry.nodeHash != null
        ? capture.nodeHash !== entry.nodeHash
        : false;
    if (capture != null && capture.nodeHash == null) unhashed.push(`${kind}/${key}`);

    for (const variant of entry.children) {
      if (variant.status !== 'shootable') continue;
      const dest = path.join(dir, `${sanitizeNodeId(variant.nodeId)}.png`);
      const item: WorklistItem = { kind, key, fileKey: entry.fileKey, nodeId: variant.nodeId, dest };
      if (!fs.existsSync(dest)) missing.push(item);
      else if (specChanged) changed.push(item);
      else present += 1;
    }
  }
  return { missing, changed, present, unhashed, provenance };
}

export function runStatus(vw: VisualWorkspace, opts: { components?: string[]; json?: boolean }): Worklist {
  const manifest = readJson<Manifest>(vw.manifestPath);
  const only = opts.components?.length ? new Set(opts.components) : null;
  const list = worklist(vw, manifest, only);

  if (opts.json) {
    console.log(JSON.stringify(list, null, 2));
    return list;
  }

  console.log(
    `baselines: ${list.present} current, ${list.changed.length} changed, ${list.missing.length} missing` +
      (list.unhashed.length ? ` (${list.unhashed.length} spec(s) captured pre-hash — not comparable, treated as current)` : ''),
  );
  const byKey = new Map<string, { label: string; count: number }>();
  for (const [label, items] of [
    ['missing', list.missing],
    ['changed', list.changed],
  ] as const) {
    for (const item of items) {
      const k = `${item.kind}/${item.key}`;
      const cur = byKey.get(k);
      if (cur) cur.count += 1;
      else byKey.set(k, { label, count: 1 });
    }
  }
  for (const [k, { label, count }] of byKey) {
    console.log(`  ${k} — ${count} ${label}`);
  }
  if (list.missing.length || list.changed.length) {
    console.log('capture them with: specs testing visual baseline');
  }
  return list;
}
