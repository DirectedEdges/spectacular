// The semantic rule catalogue — SPECIFICATION.md §9's validator-class rules,
// the requirements JSON Schema cannot express. Every violation names its rule,
// because the negative fixtures pair each rejected document with the rule it
// violates, and a validator that rejects for the wrong reason does not conform.
//
// Scope: what one document states about itself. Pointers rooted in the
// workspace (`#/components/…`, `<file>#/…`) need the rest of the workspace to
// resolve and are left to a workspace-aware caller — the CLI's reference layer
// checks them across files. `ctx.exclude` lets such a caller skip the rules it
// covers itself.

import {
  componentScopes,
  isObj,
  isWorkspacePointer,
  layoutRoots,
  owningScope,
  resolvePointer,
  triplets,
  walk,
  type Obj,
  type Scope,
} from './walk.js';
import { schemaFile } from './schemas.js';
import type { DocumentKind, RuleContext, Violation } from './types.js';

export interface Rule {
  id: string;
  /** The §9 rule text, abbreviated. */
  summary: string;
  kinds: readonly DocumentKind[];
  check: (doc: unknown, kind: DocumentKind, ctx: RuleContext) => Violation[];
}

/**
 * Validator-class rules this package cannot check from a document alone, with
 * the reason. Listed so the gap is visible rather than implied; the
 * conformance test asserts every validator-class rule is implemented or
 * named here.
 */
export const UNCHECKED_RULES: ReadonlyMap<string, string> = new Map([
  [
    'DSPEC-33',
    'The code-only prop hierarchy lives in the props block, declared once per document — what must stay constant across variants is producer behaviour across generation runs, which no single document records.',
  ],
  [
    'DSPEC-63',
    'The structural half — a guidelines document carries rule entries only — is enforced by guidelines.schema.json (closed properties; every section an entry array). Whether a statement describes a token rather than binding a reader is a prose judgment no validator can make.',
  ],
]);

const COMPONENT_KINDS: readonly DocumentKind[] = ['component', 'component-concern', 'composition-concern'];
const GENERATED_KINDS: readonly DocumentKind[] = [
  'component',
  'component-concern',
  'composition-concern',
  'components',
];

const FOUNDATION_VOCABULARY = new Set([
  'color',
  'typography',
  'layout',
  'space',
  'shape',
  'elevation',
  'motion',
  'brand',
]);

/**
 * Element types whose fill `fillColor` paints. DSPEC-27's prose says glyph
 * only, but `styles.schema.json` declares fillColor as "the fill of a glyph or
 * vector shape" — the schema's broader set governs until the catalogue is
 * corrected, so a shape element's fill is not rejected.
 */
const FILLABLE_TYPES = new Set(['glyph', 'vector', 'line', 'ellipse', 'rectangle', 'polygon', 'star']);

/** A `$nested` that anchors in this document: a variant's `configuration` or an invalid-combination entry. */
const VARIANT_NESTED = /\/(configuration|invalidPropCombinations\/\d+)\/\$nested$/;

function violation(rule: string, path: string, message: string): Violation {
  return { rule, path, message };
}

/** The declared props map of a scope, when this document carries one. */
function scopeProps(scope: Scope): Obj | undefined {
  return isObj(scope.node.props) ? scope.node.props : undefined;
}

/** Whether a prop declaration accepts `null`, honouring each type's declared default for `nullable`. */
function acceptsNull(prop: Obj): boolean | undefined {
  if (prop.type === 'boolean') return false;
  if (prop.type === 'object') return undefined; // ObjectProp declares no nullability; null is judged per member
  if (prop.type === 'string' && Array.isArray(prop.enum)) return prop.nullable === true;
  return prop.nullable !== false;
}

/** Every prop-configuration map in a scope that configures the scope's own props. */
function configSites(scope: Scope): { config: Obj; base: string }[] {
  const sites: { config: Obj; base: string }[] = [];
  const add = (value: unknown, base: string) => {
    if (isObj(value)) sites.push({ config: value, base });
  };
  const def = scope.node.default;
  if (isObj(def)) add(def.configuration, `${scope.base}/default/configuration`);
  const variants = scope.node.variants;
  if (Array.isArray(variants)) {
    variants.forEach((variant, i) => {
      if (isObj(variant)) add(variant.configuration, `${scope.base}/variants/${i}/configuration`);
    });
  }
  const invalid = scope.node.invalidPropCombinations;
  if (Array.isArray(invalid)) {
    invalid.forEach((combo, i) => add(combo, `${scope.base}/invalidPropCombinations/${i}`));
  }
  const examples = scope.node.instanceExamples;
  if (isObj(examples) && isObj(examples.items)) {
    for (const [key, item] of Object.entries(examples.items)) {
      if (isObj(item)) add(item.propConfigurations, `${scope.base}/instanceExamples/items/${key}/propConfigurations`);
    }
  }
  return sites;
}

/**
 * A resolved in-document slot fill: the slot prop that accepts it, the
 * SlotContent/Composition it resolves to, and where the reference sits.
 */
function slotFills(doc: unknown, scope: Scope): { prop: Obj; fill: Obj; path: string }[] {
  const props = scopeProps(scope);
  if (!props) return [];
  const fills: { prop: Obj; fill: Obj; path: string }[] = [];
  const resolveFill = (ref: unknown, prop: Obj, path: string) => {
    if (!isObj(ref) || typeof ref.$slotContent !== 'string') return;
    if (isWorkspacePointer(ref.$slotContent)) return;
    const target = resolvePointer(doc, ref.$slotContent);
    if (isObj(target)) fills.push({ prop, fill: target, path });
  };
  for (const site of configSites(scope)) {
    for (const [key, value] of Object.entries(site.config)) {
      const prop = props[key];
      if (isObj(prop) && prop.type === 'slot') resolveFill(value, prop, `${site.base}/${key}`);
    }
  }
  // SlotBinding example fills: an element's children bound to a slot prop,
  // carrying authored sample fills.
  for (const triplet of triplets(scope)) {
    for (const [key, element] of Object.entries(triplet.elements)) {
      if (!isObj(element) || !isObj(element.children)) continue;
      const binding = element.children.$binding;
      const match = typeof binding === 'string' ? /^#\/props\/([^/]+)$/.exec(binding) : null;
      const prop = match ? props[match[1]] : undefined;
      if (!isObj(prop) || prop.type !== 'slot') continue;
      const examples = element.children.examples;
      if (Array.isArray(examples)) {
        examples.forEach((ref, i) => resolveFill(ref, prop, `${triplet.base}/${key}/children/examples/${i}`));
      }
    }
  }
  return fills;
}

/** A `{ colorSpace, components }` object anywhere in a document. */
function isColorObject(value: unknown): value is Obj {
  return isObj(value) && typeof value.colorSpace === 'string' && Array.isArray(value.components);
}

export const RULES: readonly Rule[] = [
  {
    id: 'DSPEC-01',
    summary: 'A $slotContent pointer resolves to a reachable anatomy + elements + layout target',
    kinds: GENERATED_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      walk(doc, (value, path) => {
        if (!isObj(value) || typeof value.$slotContent !== 'string') return;
        const pointer = value.$slotContent;
        if (isWorkspacePointer(pointer)) return;
        const target = resolvePointer(doc, pointer);
        if (!isObj(target)) {
          violations.push(violation('DSPEC-01', `${path}/$slotContent`, `"${pointer}" resolves to nothing in this document`));
        } else if (!(isObj(target.anatomy) && isObj(target.elements) && Array.isArray(target.layout))) {
          violations.push(
            violation('DSPEC-01', `${path}/$slotContent`, `"${pointer}" resolves to something that is not an anatomy + elements + layout target`),
          );
        }
      });
      return violations;
    },
  },
  {
    id: 'DSPEC-02',
    summary: "A $binding points at a prop key the declaring scope's props carries",
    kinds: GENERATED_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      const scopes = componentScopes(doc);
      walk(doc, (value, path) => {
        if (!isObj(value) || typeof value.$binding !== 'string') return;
        const pointer = value.$binding;
        if (isWorkspacePointer(pointer)) return;
        const match = /^#\/props\/([^/]+)$/.exec(pointer);
        if (!match) {
          violations.push(violation('DSPEC-02', `${path}/$binding`, `"${pointer}" is not a #/props/<name> pointer`));
          return;
        }
        const scope = owningScope(scopes, path);
        const props = scopeProps(scope);
        if (!props) return; // a concern document without the api members cannot be judged alone
        if (!isObj(props[match[1]])) {
          violations.push(violation('DSPEC-02', `${path}/$binding`, `prop "${match[1]}" is not declared in this scope's props`));
        }
      });
      return violations;
    },
  },
  {
    id: 'DSPEC-03',
    summary: "A SubcomponentRef's key exists in the document's subcomponents",
    kinds: GENERATED_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      if (!isObj(doc)) return violations;
      const subs = isObj(doc.subcomponents) ? doc.subcomponents : {};
      walk(doc, (value, path) => {
        if (!isObj(value) || typeof value.$ref !== 'string') return;
        const match = /^#\/subcomponents\/([^/]+)/.exec(value.$ref);
        if (!match) return; // ElementTypeRef targets an external URI, out of scope by design (§5.2)
        if (!isObj(subs[match[1]])) {
          violations.push(violation('DSPEC-03', `${path}/$ref`, `subcomponent "${match[1]}" is not declared in this document`));
        }
      });
      return violations;
    },
  },
  {
    id: 'DSPEC-04',
    summary: 'Every $nested path segment is an instanceOf element key, resolved by direct lookup',
    kinds: COMPONENT_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      const scopes = componentScopes(doc);
      walk(doc, (value, path) => {
        // Only a variant-level $nested anchors in this document's anatomy; one
        // under an element's propConfigurations descends into the instanced
        // component's anatomy, in another document.
        if (!VARIANT_NESTED.test(path) || !Array.isArray(value)) return;
        const scope = owningScope(scopes, path);
        const anatomy = isObj(scope.node.anatomy) ? scope.node.anatomy : undefined;
        if (!anatomy) return;
        value.forEach((entry, i) => {
          if (!isObj(entry) || !Array.isArray(entry.path) || entry.path.length === 0) return;
          // Only the first segment is resolvable here: deeper segments descend
          // into the instanced component's own anatomy, in another document.
          const first = entry.path[0];
          if (typeof first !== 'string') return;
          const element = anatomy[first];
          if (!isObj(element)) {
            violations.push(violation('DSPEC-04', `${path}/${i}/path/0`, `"${first}" is not an anatomy element key`));
          } else if (element.type !== 'slot' && element.instanceOf === undefined) {
            violations.push(violation('DSPEC-04', `${path}/${i}/path/0`, `"${first}" declares no instanceOf — a $nested path descends instance to instance`));
          }
        });
      });
      return violations;
    },
  },
  {
    id: 'DSPEC-05',
    summary: 'A $nested path never descends through a slot fill',
    kinds: COMPONENT_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      const scopes = componentScopes(doc);
      walk(doc, (value, path) => {
        if (!VARIANT_NESTED.test(path) || !Array.isArray(value)) return;
        const scope = owningScope(scopes, path);
        const anatomy = isObj(scope.node.anatomy) ? scope.node.anatomy : undefined;
        if (!anatomy) return;
        value.forEach((entry, i) => {
          if (!isObj(entry) || !Array.isArray(entry.path)) return;
          const first = entry.path[0];
          if (typeof first !== 'string') return;
          const element = anatomy[first];
          if (isObj(element) && element.type === 'slot') {
            violations.push(violation('DSPEC-05', `${path}/${i}/path/0`, `"${first}" is a slot — a filled slot is a reference, handled by recursion into the target entry's own $nested paths`));
          }
        });
      });
      return violations;
    },
  },
  {
    id: 'DSPEC-06',
    summary: 'At most one SlotProp per component carries defaultSlot: true',
    kinds: COMPONENT_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      for (const scope of componentScopes(doc)) {
        const props = scopeProps(scope);
        if (!props) continue;
        const defaults = Object.entries(props).filter(
          ([, prop]) => isObj(prop) && prop.type === 'slot' && prop.defaultSlot === true,
        );
        if (defaults.length > 1) {
          for (const [key] of defaults.slice(1)) {
            violations.push(
              violation('DSPEC-06', `${scope.base}/props/${key}/defaultSlot`, `"${defaults[0][0]}" is already the default slot — a component designates at most one`),
            );
          }
        }
      }
      return violations;
    },
  },
  {
    id: 'DSPEC-07',
    summary: "contentStyles appears only on slot elements, keyed consistently with the slot's markers",
    kinds: COMPONENT_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      for (const scope of componentScopes(doc)) {
        const props = scopeProps(scope);
        for (const triplet of triplets(scope)) {
          for (const [key, element] of Object.entries(triplet.elements)) {
            if (!isObj(element) || element.contentStyles === undefined) continue;
            const anatomyEntry = triplet.anatomy[key];
            if (!isObj(anatomyEntry) || typeof anatomyEntry.type !== 'string') continue;
            if (anatomyEntry.type !== 'slot') {
              violations.push(
                violation('DSPEC-07', `${triplet.base}/${key}/contentStyles`, `"${key}" is a ${anatomyEntry.type} element — contentStyles is meaningful only on a slot`),
              );
              continue;
            }
            // Marker agreement, where the slot's prop and its anyOf are known.
            const binding = isObj(element.children) ? element.children.$binding : undefined;
            const match = typeof binding === 'string' ? /^#\/props\/([^/]+)$/.exec(binding) : null;
            const prop = match && props ? props[match[1]] : undefined;
            if (isObj(prop) && Array.isArray(prop.anyOf) && isObj(element.contentStyles)) {
              for (const marker of Object.keys(element.contentStyles)) {
                if (!prop.anyOf.includes(marker)) {
                  violations.push(
                    violation('DSPEC-07', `${triplet.base}/${key}/contentStyles/${marker.replace('$', '$')}`, `the slot's anyOf does not admit ${marker} content`),
                  );
                }
              }
            }
          }
        }
      }
      return violations;
    },
  },
  {
    id: 'DSPEC-09',
    summary: 'An owned element carries at most one role; the array form appears only on instances',
    kinds: GENERATED_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      walk(doc, (value, path) => {
        if (!isObj(value) || !Array.isArray(value.role)) return;
        if (typeof value.type === 'string' && value.type !== 'instance') {
          violations.push(
            violation('DSPEC-09', `${path}/role`, `a role array is meaningful only on an instance element; this element is a ${value.type}`),
          );
        }
      });
      return violations;
    },
  },
  {
    id: 'DSPEC-11',
    summary: 'A configuration key names a prop declared in props',
    kinds: COMPONENT_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      for (const scope of componentScopes(doc)) {
        const props = scopeProps(scope);
        if (!props) continue; // a variants/examples concern cannot be judged without its api document
        for (const site of configSites(scope)) {
          for (const key of Object.keys(site.config)) {
            if (key === '$nested') continue;
            if (!isObj(props[key])) {
              violations.push(violation('DSPEC-11', `${site.base}/${key}`, `prop "${key}" is not declared in props`));
            }
          }
        }
      }
      return violations;
    },
  },
  {
    id: 'DSPEC-12',
    summary: 'null appears only under a nullable prop',
    kinds: COMPONENT_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      for (const scope of componentScopes(doc)) {
        const props = scopeProps(scope);
        if (!props) continue;
        for (const site of configSites(scope)) {
          for (const [key, value] of Object.entries(site.config)) {
            if (value !== null) continue;
            const prop = props[key];
            if (!isObj(prop)) continue; // DSPEC-11's finding, not this rule's
            const nullable = acceptsNull(prop);
            if (nullable === false) {
              violations.push(violation('DSPEC-12', `${site.base}/${key}`, `prop "${key}" is not nullable`));
            }
          }
        }
      }
      return violations;
    },
  },
  {
    id: 'DSPEC-14',
    summary: 'Every $image reference resolves to an images registry entry',
    kinds: GENERATED_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      walk(doc, (value, path) => {
        if (!isObj(value) || typeof value.$image !== 'string') return;
        const pointer = value.$image;
        if (isWorkspacePointer(pointer)) return;
        const target = resolvePointer(doc, pointer);
        if (!isObj(target)) {
          violations.push(violation('DSPEC-14', `${path}/$image`, `"${pointer}" names no images registry entry in this document`));
        }
      });
      return violations;
    },
  },
  {
    id: 'DSPEC-20',
    summary: 'Following $slotContent references never returns to the starting entry',
    kinds: GENERATED_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      if (!isObj(doc)) return violations;
      // Entry bases that a pointer can land in, across every scope's registries.
      const entries = new Map<string, unknown>();
      for (const scope of componentScopes(doc)) {
        for (const registry of ['slotContentExamples', 'slotContent'] as const) {
          const map = scope.node[registry];
          if (!isObj(map)) continue;
          for (const key of Object.keys(map)) entries.set(`${scope.base}/${registry}/${key}`, map[key]);
        }
      }
      const entryOf = (pointer: string): string | undefined => {
        const body = pointer.startsWith('#') ? pointer.slice(1) : pointer;
        for (const base of entries.keys()) {
          if (body === base || body.startsWith(`${base}/`)) return base;
        }
        return undefined;
      };
      const edges = new Map<string, Set<string>>();
      for (const [base, entry] of entries) {
        const out = new Set<string>();
        walk(entry, value => {
          if (isObj(value) && typeof value.$slotContent === 'string' && !isWorkspacePointer(value.$slotContent)) {
            const target = entryOf(value.$slotContent);
            if (target) out.add(target);
          }
        });
        edges.set(base, out);
      }
      const inCycle = new Set<string>();
      const visit = (node: string, trail: string[]) => {
        const at = trail.indexOf(node);
        if (at !== -1) {
          trail.slice(at).forEach(n => inCycle.add(n));
          return;
        }
        for (const next of edges.get(node) ?? []) visit(next, [...trail, node]);
      };
      for (const base of entries.keys()) visit(base, []);
      for (const base of [...inCycle].sort()) {
        violations.push(violation('DSPEC-20', base, 'this entry is part of a $slotContent reference cycle'));
      }
      return violations;
    },
  },
  {
    id: 'DSPEC-27',
    summary: 'fillColor appears only on fillable elements; textColor only on text elements',
    kinds: COMPONENT_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      for (const scope of componentScopes(doc)) {
        for (const triplet of triplets(scope)) {
          for (const [key, element] of Object.entries(triplet.elements)) {
            if (!isObj(element) || !isObj(element.styles)) continue;
            const anatomyEntry = triplet.anatomy[key];
            if (!isObj(anatomyEntry) || typeof anatomyEntry.type !== 'string') continue;
            if ('textColor' in element.styles && anatomyEntry.type !== 'text') {
              violations.push(
                violation('DSPEC-27', `${triplet.base}/${key}/styles/textColor`, `textColor belongs to text elements; "${key}" is a ${anatomyEntry.type}`),
              );
            }
            if ('fillColor' in element.styles && !FILLABLE_TYPES.has(anatomyEntry.type)) {
              violations.push(
                violation('DSPEC-27', `${triplet.base}/${key}/styles/fillColor`, `fillColor belongs to glyph and shape elements; "${key}" is a ${anatomyEntry.type}`),
              );
            }
          }
        }
      }
      return violations;
    },
  },
  {
    id: 'DSPEC-29',
    summary: 'compareTo is present for binary operations and absent for unary ones',
    kinds: GENERATED_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      walk(doc, (value, path) => {
        if (!isObj(value) || typeof value.operation !== 'string' || !isObj(value.args)) return;
        const op = value.operation;
        const has = 'compareTo' in value.args;
        if ((op === 'equals' || op === 'notEquals') && !has) {
          violations.push(violation('DSPEC-29', `${path}/args`, `"${op}" is binary — compareTo is required`));
        }
        if ((op === 'isNull' || op === 'isNotNull') && has) {
          violations.push(violation('DSPEC-29', `${path}/args/compareTo`, `"${op}" is unary — compareTo must be absent`));
        }
        // Any other operation is an open-vocabulary extension (DSPEC-28); its arity is its own business.
      });
      return violations;
    },
  },
  {
    id: 'DSPEC-34',
    summary: 'Content filling a slot with anyOf present is an instance of a named entry or a permitted primitive',
    kinds: COMPONENT_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      for (const scope of componentScopes(doc)) {
        for (const { prop, fill, path } of slotFills(doc, scope)) {
          if (!Array.isArray(prop.anyOf)) continue;
          const anatomy = isObj(fill.anatomy) ? fill.anatomy : {};
          for (const root of layoutRoots(fill.layout)) {
            const element = anatomy[root];
            if (!isObj(element)) continue;
            const type = element.type;
            if (type === 'instance') {
              const inst = element.instanceOf;
              if (typeof inst === 'string' && !prop.anyOf.includes(inst)) {
                violations.push(violation('DSPEC-34', path, `the slot's anyOf does not admit "${inst}"`));
              }
            } else if (type === 'text') {
              if (!prop.anyOf.includes('$text')) {
                violations.push(violation('DSPEC-34', path, "the slot's anyOf does not admit $text content"));
              }
            } else if (type === 'glyph') {
              if (!prop.anyOf.includes('$glyph')) {
                violations.push(violation('DSPEC-34', path, "the slot's anyOf does not admit $glyph content"));
              }
            } else if (typeof type === 'string') {
              violations.push(violation('DSPEC-34', path, `a ${type} element is neither a named component nor a permitted primitive`));
            }
          }
        }
      }
      return violations;
    },
  },
  {
    id: 'DSPEC-35',
    summary: "The number of items filling a slot falls within its declared minChildren/maxChildren",
    kinds: COMPONENT_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      for (const scope of componentScopes(doc)) {
        for (const { prop, fill, path } of slotFills(doc, scope)) {
          const count = layoutRoots(fill.layout).length;
          if (typeof prop.minChildren === 'number' && count < prop.minChildren) {
            violations.push(violation('DSPEC-35', path, `the fill has ${count} item(s); the slot requires at least ${prop.minChildren}`));
          }
          if (typeof prop.maxChildren === 'number' && count > prop.maxChildren) {
            violations.push(violation('DSPEC-35', path, `the fill has ${count} item(s); the slot admits at most ${prop.maxChildren}`));
          }
        }
      }
      return violations;
    },
  },
  {
    id: 'DSPEC-39',
    summary: 'When settings.spec.color is not OBJECT, every colour-bearing value is a string in that notation',
    kinds: GENERATED_KINDS,
    check(doc, _kind, ctx) {
      const spec = isObj(ctx.settings) && isObj(ctx.settings.spec) ? ctx.settings.spec : undefined;
      if (!spec) return []; // without the workspace's settings there is no declared notation to hold the document to
      const notation = typeof spec.color === 'string' ? spec.color : 'HEXA';
      if (notation === 'OBJECT') return [];
      const violations: Violation[] = [];
      walk(doc, (value, path) => {
        if (isColorObject(value)) {
          violations.push(
            violation('DSPEC-39', path, `an inline colour object under settings.spec.color ${notation} — every colour-bearing value must be a ${notation} string`),
          );
        }
      });
      return violations;
    },
  },
  {
    id: 'DSPEC-40',
    summary: "The length and order of a ColorObject's components correspond to the channels of its colorSpace",
    kinds: GENERATED_KINDS,
    check(doc) {
      const violations: Violation[] = [];
      walk(doc, (value, path) => {
        if (!isColorObject(value)) return;
        // Every colour space the schema admits is three-channel; alpha is its own member.
        if ((value.components as unknown[]).length !== 3) {
          violations.push(
            violation('DSPEC-40', `${path}/components`, `"${String(value.colorSpace)}" has 3 channels; ${(value.components as unknown[]).length} component(s) given`),
          );
        }
      });
      return violations;
    },
  },
  {
    id: 'DSPEC-55',
    summary: 'A declared images.component requires a non-empty images.sourceProps',
    kinds: ['conventions'],
    check(doc) {
      const violations: Violation[] = [];
      if (!isObj(doc) || !isObj(doc.platforms)) return violations;
      for (const [name, platform] of Object.entries(doc.platforms)) {
        if (!isObj(platform) || !isObj(platform.images)) continue;
        const images = platform.images;
        if (images.component !== undefined && !(Array.isArray(images.sourceProps) && images.sourceProps.length > 0)) {
          violations.push(
            violation('DSPEC-55', `/platforms/${name}/images/sourceProps`, 'a declared images.component requires a non-empty images.sourceProps, whose first entry is that component\'s own source prop'),
          );
        }
      }
      return violations;
    },
  },
  {
    id: 'DSPEC-58',
    summary: 'A schemaGap.path that is a JSON Schema pointer resolves against the schema file it names',
    kinds: ['supplemental'],
    check(doc) {
      const violations: Violation[] = [];
      walk(doc, (value, path) => {
        if (!isObj(value) || !isObj(value.schemaGap)) return;
        const gap = value.schemaGap.path;
        if (typeof gap !== 'string') return;
        const match = /^([A-Za-z0-9-]+\.schema\.json)#(\/.*)$/.exec(gap);
        if (!match) return; // a workspace-relative target names the library's own data, not a schema surface
        const schema = schemaFile(match[1]);
        if (!schema) {
          violations.push(violation('DSPEC-58', `${path}/schemaGap/path`, `"${match[1]}" is not a schema file this package publishes`));
        } else if (resolvePointer(schema, match[2]) === undefined) {
          violations.push(violation('DSPEC-58', `${path}/schemaGap/path`, `"${match[2]}" resolves to nothing in ${match[1]}`));
        }
      });
      return violations;
    },
  },
  {
    id: 'DSPEC-62',
    summary: 'A directory under foundations/ is named from the foundation concern vocabulary',
    kinds: ['supplemental', 'guidelines'],
    check(_doc, _kind, ctx) {
      if (!ctx.documentPath) return []; // the path selects the schema; without it there is nothing to check
      const match = /(?:^|\/)foundations\/([^/]+)\//.exec(ctx.documentPath);
      if (!match) return [];
      if (FOUNDATION_VOCABULARY.has(match[1])) return [];
      return [
        violation('DSPEC-62', '', `"${match[1]}" is not a foundation concern — the vocabulary is ${[...FOUNDATION_VOCABULARY].join(', ')}`),
      ];
    },
  },
];

/** Run every applicable catalogue rule for a document. */
export function checkRules(doc: unknown, kind: DocumentKind, ctx: RuleContext = {}): Violation[] {
  const violations: Violation[] = [];
  for (const rule of RULES) {
    if (!rule.kinds.includes(kind)) continue;
    if (ctx.exclude?.has(rule.id)) continue;
    violations.push(...rule.check(doc, kind, ctx));
  }
  return violations;
}
