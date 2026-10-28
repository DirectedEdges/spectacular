import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import type { Transformer, TransformerContext } from '../transforms/transformer.js';
import { ANALYSIS_DIR } from '../utilities/specsLayout.js';
import {
  ROLE_VOCABULARY,
  conceptsOf,
  isKnownConcept,
  type RoleStatus,
} from './roleVocabulary.js';

/**
 * Reports which anatomy elements declare a role, which do not, and what the declared
 * values are, across a whole library (ADR-067).
 *
 * Roles are the one input in the vocabulary with no acquisition path: every other fact
 * about a component is observable in Figma, while a role is a human judgment annotated one
 * layer at a time. So the first thing a library adopting them needs is a measure — how
 * much is annotated, with what, and where the gaps are — and the same report run again is
 * what shows a sweep landed.
 *
 * This reads specs and nothing else. It reports what they carry, never what they should:
 * which role belongs on an element is a judgment, and a report that guessed would be
 * confidently wrong often enough to cost a reader their trust in the rest of it.
 *
 * Two facts shape what counts as a finding. A role value outside the documented vocabulary
 * is **reported, not rejected** — the schema types a role as an open string and transforms
 * ignore concepts they do not know, so an unrecognized value is a likely typo rather than a
 * broken spec. And a part role on a component with no control of its own is **not** a
 * finding: that is how a provider component declares what it offers, and the wiring arrives
 * when it is composed.
 */

/** An element that declares a role, with enough context to find it again. */
interface RoleUse {
  element: string;
  concepts: string[];
  /** `instance` elements route rather than claim, which changes every rule about them. */
  instance: boolean;
}

type FindingKind =
  | 'multiple-roles-on-owned-element'
  | 'routed-concept-not-provided'
  | 'unknown-concept'
  | 'malformed-role-value';

interface Finding {
  kind: FindingKind;
  component: string;
  element: string;
  detail: string;
}

interface ComponentReport {
  annotated: number;
  unannotated: number;
  roles?: Record<string, string | string[]>;
  /** Elements with no role, with their type — the candidates a proposal would consider. */
  bare?: Record<string, string>;
}

interface RolesAggregate {
  summary: {
    components: number;
    componentsAnnotated: number;
    elements: number;
    elementsAnnotated: number;
    conceptsInUse: Record<string, number>;
    /** Vocabulary concepts no spec references — the unused half of what is available. */
    conceptsUnused: string[];
    /** Concepts in use that emit nothing yet, so the annotation is inert for now. */
    conceptsInertInUse: Record<string, RoleStatus>;
    findings: number;
  };
  findings?: Finding[];
  byComponent: Record<string, ComponentReport>;
}

/** What one component's anatomy declared, kept until finalize can resolve across components. */
interface Collected {
  component: string;
  uses: RoleUse[];
  bare: Record<string, string>;
  /** element key → the component key its `instanceOf` names, where that is a plain name. */
  instanceTargets: Record<string, string>;
  elements: number;
}

export class RolesAnalyzer implements Transformer {
  readonly name = 'roles';

  // Components only. A composition declares no anatomy of its own, so rows for it would be
  // empty by construction and would dilute every per-component figure.
  readonly readsKinds = ['component'] as const;

  private readonly _collected: Collected[] = [];
  private _outputFormat: 'JSON' | 'YAML' = 'JSON';

  async run(apiYaml: Record<string, unknown>, context: TransformerContext): Promise<void> {
    this._outputFormat = context.outputFormat;
    this._collected.push(this.collect(context.componentKey, apiYaml));
  }

  private collect(component: string, comp: Record<string, unknown>): Collected {
    const anatomy = (comp.anatomy ?? {}) as Record<string, unknown>;
    const uses: RoleUse[] = [];
    const bare: Record<string, string> = {};
    const instanceTargets: Record<string, string> = {};
    let elements = 0;

    for (const [element, raw] of Object.entries(anatomy)) {
      if (!raw || typeof raw !== 'object') continue;
      elements++;
      const entry = raw as Record<string, unknown>;
      const type = typeof entry.type === 'string' ? entry.type : 'unknown';
      const instance = type === 'instance';

      if (instance) {
        // `instanceOf` is a formatted key or a `$ref` into subcomponents. Only the plain
        // name can be resolved against another component in this run; a `$ref` points
        // inside the same spec and is not another component's declaration.
        const target = entry.instanceOf;
        if (typeof target === 'string') instanceTargets[element] = target;
      }

      if (entry.role === undefined) {
        bare[element] = type;
        continue;
      }

      uses.push({ element, concepts: conceptsOf(entry.role), instance });
    }

    return { component, uses, bare, instanceTargets, elements };
  }

  async finalize(outputDir: string, analysisDir?: string): Promise<void> {
    if (this._collected.length === 0) return;

    const outDir = analysisDir ?? path.join(outputDir, ANALYSIS_DIR);
    await fs.ensureDir(outDir);

    const aggregate = this.buildAggregate();
    const ext = this._outputFormat === 'JSON' ? 'json' : 'yaml';
    const content = this._outputFormat === 'JSON'
      ? JSON.stringify(aggregate, null, 2) + '\n'
      : yaml.stringify(aggregate, { lineWidth: 120 });
    await fs.writeFile(path.join(outDir, `roles.${ext}`), content, 'utf-8');
  }

  /** What each component ascribes, for resolving a routed concept against its provider. */
  private providedConcepts(): Map<string, Set<string>> {
    const provided = new Map<string, Set<string>>();
    for (const { component, uses } of this._collected) {
      const set = new Set<string>();
      for (const use of uses) {
        // Only what the component ascribes to its **own** elements. A concept it merely
        // routes onward is not something it provides.
        if (use.instance) continue;
        for (const concept of use.concepts) set.add(concept);
      }
      provided.set(component, set);
    }
    return provided;
  }

  private buildAggregate(): RolesAggregate {
    const provided = this.providedConcepts();
    const findings: Finding[] = [];
    const conceptsInUse: Record<string, number> = {};
    const byComponent: Record<string, ComponentReport> = {};

    let elements = 0;
    let elementsAnnotated = 0;
    let componentsAnnotated = 0;

    for (const { component, uses, bare, instanceTargets, elements: count } of this._collected) {
      elements += count;
      elementsAnnotated += uses.length;
      if (uses.length > 0) componentsAnnotated++;

      const roles: Record<string, string | string[]> = {};

      for (const use of uses) {
        roles[use.element] = use.concepts.length === 1 ? use.concepts[0] : use.concepts;

        for (const concept of use.concepts) {
          conceptsInUse[concept] = (conceptsInUse[concept] ?? 0) + 1;
          if (!isKnownConcept(concept)) {
            findings.push({
              kind: 'unknown-concept',
              component,
              element: use.element,
              detail: `"${concept}" is not in the documented vocabulary — likely a typo, since transforms ignore concepts they do not know. See /roles/inventory/.`,
            });
          }
        }

        // `role` was present but yielded nothing a reader would recover — a number, an
        // empty string, `Role: Button`. Worth separating from a concept that is merely
        // unrecognized: that one round-trips and is probably a typo, this one is discarded.
        if (use.concepts.length === 0) {
          findings.push({
            kind: 'malformed-role-value',
            component,
            element: use.element,
            detail: 'role declares no value the reader would recover — a concept is a single lowercase alphanumeric token.',
          });
        }

        if (!use.instance && use.concepts.length > 1) {
          findings.push({
            kind: 'multiple-roles-on-owned-element',
            component,
            element: use.element,
            detail: `declares ${use.concepts.length} roles (${use.concepts.join(', ')}) on an element the component owns, where the question of what it is has one answer. A list is meaningful only on an instance, where it routes.`,
          });
        }

        if (use.instance) {
          const target = instanceTargets[use.element];
          const ascribed = target === undefined ? undefined : provided.get(target);
          for (const concept of use.concepts) {
            if (!isKnownConcept(concept)) continue; // already reported as unknown
            if (ascribed === undefined) continue;   // provider not in this run; nothing to check
            if (!ascribed.has(concept)) {
              findings.push({
                kind: 'routed-concept-not-provided',
                component,
                element: use.element,
                detail: `routes "${concept}" into ${target}, which does not ascribe it. The consumer asserts and the provider declares, and the two must agree.`,
              });
            }
          }
        }
      }

      byComponent[component] = {
        annotated: uses.length,
        unannotated: Object.keys(bare).length,
        ...(uses.length ? { roles } : {}),
        ...(Object.keys(bare).length ? { bare } : {}),
      };
    }

    const conceptsUnused = Object.keys(ROLE_VOCABULARY)
      .filter((concept) => conceptsInUse[concept] === undefined)
      .sort();

    const conceptsInertInUse: Record<string, RoleStatus> = {};
    for (const concept of Object.keys(conceptsInUse)) {
      const known = ROLE_VOCABULARY[concept];
      if (known && known.status !== 'implemented') conceptsInertInUse[concept] = known.status;
    }

    return {
      summary: {
        components: this._collected.length,
        componentsAnnotated,
        elements,
        elementsAnnotated,
        conceptsInUse: sortedByCountThenName(conceptsInUse),
        conceptsUnused,
        conceptsInertInUse,
        findings: findings.length,
      },
      ...(findings.length ? { findings } : {}),
      byComponent,
    };
  }
}

/** Most-used first, so the shape of a library's adoption is the first thing read. */
function sortedByCountThenName(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, count] of Object.entries(counts).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )) {
    out[name] = count;
  }
  return out;
}
