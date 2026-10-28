// Shared shapes for `specs testing visual` (specs#588).
//
// Two baselines, one manifest: fidelity diffs renders against Figma exports,
// regression diffs them against the last accepted renders. Both kinds of spec
// are first-class — a component and a composition may legally share a name, so
// everything on disk and in these shapes keys kind before key.
import type { SpecKind } from '../../utilities/specsLayout.js';

export type { SpecKind };

/** The directory a kind's artifacts live under (figma/, render/, …). */
export function kindDir(kind: SpecKind): string {
  return kind === 'composition' ? 'compositions' : 'components';
}

/** A platform whose emitted Storybook stories can be shot. */
export type Target = 'react' | 'webcomponents';

export const TARGETS: readonly Target[] = ['react', 'webcomponents'];

export const DEFAULT_TARGET: Target = 'react';

export function isTarget(value: string): value is Target {
  return (TARGETS as readonly string[]).includes(value);
}

/** How a variant left the manifest stage. */
export type VariantStatus =
  | 'shootable'
  | 'deferred-unmapped'
  | 'deferred-interaction'
  | 'deferred-sampling'
  | 'unsupported-combination';

export interface ManifestVariant {
  nodeId: string;
  name: string;
  /** Figma `Prop=Value` configuration; empty for a composition. */
  config: Record<string, string>;
  invalidCombination?: boolean;
  /** Authored node size in CSS px. */
  size?: [number, number];
  /** [dx, dy, w, h]: node box offset within render bounds, when they differ. */
  ink?: [number, number, number, number];
  pinWidth?: boolean;
  /** Compositions only: the frame's height is FIXED, so the shoot pins it too. */
  pinHeight?: boolean;
  /** Pseudo-state to pose at shoot time (driveInteractions opt-in). */
  interaction?: string;
  args: Record<string, unknown>;
  status: VariantStatus;
}

export interface PropMapping {
  prop: string;
  type: string | null;
  kind: 'arg' | 'interaction';
  default: unknown;
}

export interface ManifestEntry {
  kind: SpecKind;
  source: string;
  fileKey: string;
  /**
   * sha256 of the spec's Figma node subtree as fetched. REST payloads inline
   * every instance's subtree, so a change inside a leaf component changes the
   * hash of every spec containing it — the correct propagation for a visual
   * baseline. Lets `baseline` self-scope: capture what changed, not the
   * catalogue (specs#719). Never a trigger — capture stays overt.
   */
  nodeHash: string;
  setNodeId: string;
  nodeType: string;
  pageId: string | null;
  pageCanvas: string;
  /** Story title path without the platform prefix ("EGDS Button"). */
  storyTitle: string;
  propMap: Record<string, PropMapping>;
  unmappedProps: string[];
  /** Content resets for props the variants don't drive (see manifest.ts). */
  resets: Record<string, unknown>;
  children: ManifestVariant[];
}

export interface Manifest {
  $meta: {
    workspace: string;
    scale: number;
    sources: Record<string, { fileKey: string; fileLastModified: string | null }>;
  };
  components: Record<string, ManifestEntry>;
  compositions: Record<string, ManifestEntry>;
}

/** Iterate both kind maps as [kind, key, entry]. */
export function* manifestEntries(
  manifest: Manifest,
  only?: Set<string> | null,
): Generator<[SpecKind, string, ManifestEntry]> {
  for (const kind of ['component', 'composition'] as const) {
    const map = kind === 'component' ? manifest.components : manifest.compositions;
    for (const [key, entry] of Object.entries(map ?? {})) {
      if (only && !only.has(key)) continue;
      yield [kind, key, entry];
    }
  }
}

/** Per-pair result statuses in the report. */
export type PairStatus =
  | 'diffed'
  | 'slot-hug'
  | 'no-story'
  | 'no-baseline'
  | 'shoot-failed'
  | 'skipped-ignored'
  | VariantStatus
  | 'deferred-unrepresentable';

export interface ScoringKeys {
  threshold: number;
  passPct: number;
  dimTolerancePx: number;
  skip: boolean;
  note: string | null;
}

/** Which baseline the diff scores against. */
export type DiffMode = 'figma' | 'accepted';

/**
 * The report basename a mode and target own: fidelity (vs Figma) or
 * regression (vs accepted), per platform. One file per pair, because a row
 * carries no platform of its own — a shared file silently mixed React and
 * Web Components results, and a scoped run on one platform left the other's
 * rows standing as if they were current.
 */
export function reportNameFor(mode: DiffMode, target: Target): string {
  return `${mode === 'accepted' ? 'regression' : 'fidelity'}.${target}`;
}
