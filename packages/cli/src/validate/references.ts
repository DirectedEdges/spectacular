// The reference-integrity layer of `specs validate` — the errors JSON Schema
// cannot express because they cross nodes, files, or spec folders:
//
//   $binding   → a prop declared in the owning scope's props
//   $slotContent → a slotContentExamples entry, here or in another spec
//   instanceOf → a component folder in the workspace, or an in-file subcomponent
//   layout     → element names declared in the anatomy the tree belongs to
//   elements   → keys declared in that same anatomy
//   configuration → declared props, with legal values for boolean and enum props
//
// A spec has one main scope and one per subcomponent (ADR-091 slices): a
// `#/props/<name>` pointer inside `subcomponents.<n>` resolves against that
// subcomponent's own props, never the component's.

import { specFolderKey } from '../utilities/specFolderKey.js';
import { tokenKnown, type TokenIndex } from './tokens.js';

export interface RefFinding {
  /** Concern the fact was read from: 'api' | 'variants' | 'examples'. */
  file: string;
  /** JSON-pointer-ish path to the offending node. */
  path: string;
  message: string;
  /** Absent means error. */
  level?: 'error' | 'warning';
}

/** The three parsed concern documents of one spec, any of which may be absent. */
export interface ParsedSpec {
  api?: Record<string, unknown>;
  variants?: Record<string, unknown>;
  examples?: Record<string, unknown>;
}

/** What the checks need to know about the rest of the workspace. */
export interface WorkspaceIndex {
  /** Component spec folder names. */
  components: ReadonlySet<string>;
  /** Composition spec folder names. */
  compositions: ReadonlySet<string>;
  /** Parsed concern documents of another component, if its folder exists. */
  spec(name: string): ParsedSpec | undefined;
}

const BINDING_RE = /^#\/props\/(.+)$/;
const SLOT_RE = /^#\/components\/([^/]+)(?:\/subcomponents\/([^/]+))?\/slotContentExamples\/([^/]+)$/;
const SLOT_COMPOSITION_RE = /^#\/compositions\/([^/]+)(\/|$)/;
const SUBCOMPONENT_RE = /^#\/subcomponents\/(.+)$/;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function objAt(doc: unknown, ...keys: string[]): Obj {
  let node: unknown = doc;
  for (const key of keys) node = isObj(node) ? node[key] : undefined;
  return isObj(node) ? node : {};
}

/** Element names in a layout tree: leaf strings and parent-node keys alike. */
function layoutNames(node: unknown, into: Set<string>): void {
  if (typeof node === 'string') { into.add(node); return; }
  if (Array.isArray(node)) { for (const child of node) layoutNames(child, into); return; }
  if (isObj(node)) {
    for (const [name, children] of Object.entries(node)) {
      into.add(name);
      layoutNames(children, into);
    }
  }
}

/** The props and anatomy a pointer inside one document slice resolves against. */
interface Scope {
  props: Obj;
  anatomy: ReadonlySet<string>;
}

/**
 * The slotContentExamples names a spec declares, main and per subcomponent.
 * `undefined` sub means the main set.
 */
function slotExamplesOf(spec: ParsedSpec | undefined, sub?: string): Set<string> {
  const base = sub
    ? objAt(spec?.examples, 'subcomponents', sub, 'slotContentExamples')
    : objAt(spec?.examples, 'slotContentExamples');
  return new Set(Object.keys(base));
}

/** Check every reference in one spec. `name` is the spec's own folder key. */
export function checkReferences(
  name: string,
  spec: ParsedSpec,
  index: WorkspaceIndex,
  tokens?: TokenIndex,
): RefFinding[] {
  const findings: RefFinding[] = [];

  const resolveComponentName = (value: string): string | undefined => {
    if (index.components.has(value)) return value;
    const key = specFolderKey(value);
    return key && index.components.has(key) ? key : undefined;
  };

  const subcomponentNames = new Set<string>();
  for (const doc of [spec.api, spec.variants, spec.examples]) {
    for (const k of Object.keys(objAt(doc, 'subcomponents'))) subcomponentNames.add(k);
  }

  // ---- image pointers resolve in an images registry --------------------------
  // The resolving form mirrors $slotContent's spec-key grammar:
  // `#/components/<specKey>/images/<key>`; root-relative `#/images/<key>` is the
  // single-file spelling and resolves in this spec's own registry. A dangling
  // pointer — or the concern-prefixed spelling older docs showed, which resolves
  // nowhere — previously shipped a grey image with ✓ 0 errors.
  {
    const ownRegistry = new Set([
      ...Object.keys(objAt(spec.examples, 'images')),
      ...Object.keys(objAt(spec.api, 'images')),
    ]);
    const registryOf = (specKey: string): Set<string> | undefined => {
      const target = index.spec(specKey);
      if (!target) return undefined;
      return new Set([
        ...Object.keys(objAt(target.examples, 'images')),
        ...Object.keys(objAt(target.api, 'images')),
      ]);
    };
    const IMG_FULL = /^#\/components\/([^/]+)\/images\/([a-zA-Z0-9_-]+)$/;
    const IMG_ROOT = /^#\/images\/([a-zA-Z0-9_-]+)$/;
    const walk = (node: unknown, file: 'api' | 'variants' | 'examples', pathSoFar: string): void => {
      if (Array.isArray(node)) { node.forEach((item, i) => walk(item, file, `${pathSoFar}/${i}`)); return; }
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node as Obj)) {
        const path = `${pathSoFar}/${key}`;
        if (typeof value === 'string' && value.includes('#/') && value.includes('/images/')) {
          const full = IMG_FULL.exec(value);
          const root = IMG_ROOT.exec(value);
          if (full) {
            const targetKey = full[1] === name ? undefined : full[1];
            const registry = targetKey ? registryOf(targetKey) : ownRegistry;
            if (!registry) {
              findings.push({ file, path, message: `image pointer names no spec "${full[1]}"` });
            } else if (!registry.has(full[2])) {
              findings.push({ file, path, message: `"${full[1]}" declares no images registry entry "${full[2]}"` });
            }
          } else if (root) {
            if (!ownRegistry.has(root[1])) {
              findings.push({ file, path, message: `images registry declares no "${root[1]}"` });
            }
          } else {
            findings.push({ file, path, message: `image pointer "${value}" resolves nowhere — the resolving form is '#/components/<specKey>/images/<key>' ('#/images/<key>' in a single-file spec)` });
          }
          continue;
        }
        walk(value, file, path);
      }
    };
    for (const [file, doc] of [['api', spec.api], ['variants', spec.variants], ['examples', spec.examples]] as const) {
      walk(doc, file, '');
    }

    // A registry entry with bytes but no Figma identity renders React fine and
    // the canvas grey — predictable from the data, so say it before the render.
    for (const [key, entry] of Object.entries({ ...objAt(spec.api, 'images'), ...objAt(spec.examples, 'images') })) {
      const data = entry as { src?: unknown; $extensions?: { 'com.figma'?: { imageHash?: unknown } } };
      if (typeof data?.src === 'string' && typeof data?.$extensions?.['com.figma']?.imageHash !== 'string') {
        findings.push({
          file: 'examples', path: `/images/${key}`, level: 'warning',
          message: `registry entry "${key}" has src but no com.figma imageHash — the Figma render will show the fallback colour (the hash is SHA-1 of the original bytes; transcoding invalidates it)`,
        });
      }
    }
  }

  const mainScope: Scope = {
    props: objAt(spec.api, 'props'),
    anatomy: new Set(Object.keys(objAt(spec.api, 'anatomy'))),
  };
  const subScope = (sub: string): Scope => ({
    props: objAt(spec.api, 'subcomponents', sub, 'props'),
    anatomy: new Set(Object.keys(objAt(spec.api, 'subcomponents', sub, 'anatomy'))),
  });

  /** The scope a path belongs to: `/subcomponents/<n>/…` is that slice's. */
  const scopeAt = (path: string): Scope => {
    const m = /^\/subcomponents\/([^/]+)/.exec(path);
    return m ? subScope(m[1]) : mainScope;
  };

  // ---- pointer checks, over every node of every concern document ------------

  const visit = (file: string, node: Obj, path: string): void => {
    if (typeof node.$binding === 'string') {
      const m = BINDING_RE.exec(node.$binding);
      if (!m) {
        findings.push({ file, path: `${path}/$binding`, message: `"${node.$binding}" is not a #/props/<name> pointer` });
      } else if (!(m[1] in scopeAt(path).props)) {
        const where = path.startsWith('/subcomponents/') ? 'this subcomponent\'s props' : 'api props';
        findings.push({ file, path: `${path}/$binding`, message: `prop "${m[1]}" is not declared in ${where}` });
      }
    }

    if (typeof node.$slotContent === 'string') {
      const ref = node.$slotContent;
      const m = SLOT_RE.exec(ref);
      if (m) {
        const [, target, sub, exampleName] = m;
        // The `components` pointer segment names the flat spec-key space —
        // a composition addresses its own fills the same way (observed in
        // generated data; the emitters' resolver accepts only this form).
        const resolved = target === name ? name
          : resolveComponentName(target) ?? (index.compositions.has(target) ? target : undefined);
        if (!resolved) {
          findings.push({ file, path: `${path}/$slotContent`, message: `spec "${target}" is not in this workspace` });
        } else {
          const targetSpec = resolved === name ? spec : index.spec(resolved);
          if (!slotExamplesOf(targetSpec, sub).has(exampleName)) {
            const owner = sub ? `"${resolved}" subcomponent "${sub}"` : `"${resolved}"`;
            findings.push({ file, path: `${path}/$slotContent`, message: `${owner} declares no slotContentExamples "${exampleName}"` });
          }
        }
      } else if (SLOT_COMPOSITION_RE.test(ref)) {
        const comp = SLOT_COMPOSITION_RE.exec(ref)![1];
        if (!index.compositions.has(comp)) {
          findings.push({ file, path: `${path}/$slotContent`, message: `composition "${comp}" is not in this workspace` });
        }
      } else {
        findings.push({ file, path: `${path}/$slotContent`, message: `"${ref}" is not a recognized slot content pointer` });
      }
    }

    // $token → the library's variables or styles, when a cache can answer
    if (typeof node.$token === 'string' && typeof node.$type === 'string' && tokens) {
      if (tokenKnown(tokens, node.$token, node.$type) === false) {
        findings.push({ file, path: `${path}/$token`, message: `token "${node.$token}" is not in the library (see analysis/styling.byToken.yaml for what exists)` });
      }
    }

    const inst = node.instanceOf;
    if (typeof inst === 'string') {
      if (!resolveComponentName(inst)) {
        findings.push({ file, path: `${path}/instanceOf`, message: `component "${inst}" is not in this workspace` });
      }
    } else if (isObj(inst) && typeof inst.$ref === 'string') {
      const m = SUBCOMPONENT_RE.exec(inst.$ref);
      if (!m) {
        findings.push({ file, path: `${path}/instanceOf/$ref`, message: `"${inst.$ref}" is not a #/subcomponents/<name> pointer` });
      } else if (!subcomponentNames.has(m[1])) {
        findings.push({ file, path: `${path}/instanceOf/$ref`, message: `subcomponent "${m[1]}" is not declared in this spec` });
      }
    }
  };

  const walk = (file: string, node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(file, child, `${path}/${i}`));
      return;
    }
    if (!isObj(node)) return;
    visit(file, node, path);
    for (const [key, value] of Object.entries(node)) walk(file, value, `${path}/${key}`);
  };

  for (const [file, doc] of [['api', spec.api], ['variants', spec.variants], ['examples', spec.examples]] as const) {
    if (doc) walk(file, doc, '');
  }

  // ---- anatomy- and prop-scoped checks on variant blocks --------------------

  const checkVariantBlock = (block: Obj, path: string, scope: Scope): void => {
    if (block.layout !== undefined) {
      const names = new Set<string>();
      layoutNames(block.layout, names);
      for (const n of [...names].sort()) {
        if (!scope.anatomy.has(n)) {
          findings.push({ file: 'variants', path: `${path}/layout`, message: `layout element "${n}" is not declared in anatomy` });
        }
      }
    }
    if (isObj(block.elements)) {
      for (const el of Object.keys(block.elements)) {
        if (!scope.anatomy.has(el)) {
          findings.push({ file: 'variants', path: `${path}/elements/${el}`, message: `element "${el}" is not declared in anatomy` });
        }
      }
    }
    if (isObj(block.configuration)) {
      for (const [prop, value] of Object.entries(block.configuration)) {
        if (prop === '$nested') continue;
        const decl = scope.props[prop];
        if (!isObj(decl)) {
          findings.push({ file: 'variants', path: `${path}/configuration/${prop}`, message: `prop "${prop}" is not declared in props` });
          continue;
        }
        if (value === null || isObj(value)) continue; // unset, binding, or slot fill
        if (decl.type === 'boolean' && typeof value !== 'boolean') {
          findings.push({ file: 'variants', path: `${path}/configuration/${prop}`, message: `prop "${prop}" is boolean; got ${JSON.stringify(value)}` });
        }
        if (Array.isArray(decl.enum) && !(decl.enum as unknown[]).includes(value)) {
          findings.push({ file: 'variants', path: `${path}/configuration/${prop}`, message: `"${String(value)}" is not an allowed value of "${prop}": ${(decl.enum as unknown[]).join(', ')}` });
        }
      }
    }
  };

  const checkVariantsDoc = (doc: unknown, pathPrefix: string, scope: Scope): void => {
    if (!isObj(doc)) return;
    if (isObj(doc.default)) checkVariantBlock(doc.default, `${pathPrefix}/default`, scope);
    if (Array.isArray(doc.variants)) {
      (doc.variants as unknown[]).forEach((v, i) => {
        if (isObj(v)) checkVariantBlock(v, `${pathPrefix}/variants/${i}`, scope);
      });
    }
  };

  checkVariantsDoc(spec.variants, '', mainScope);
  for (const sub of Object.keys(objAt(spec.variants, 'subcomponents'))) {
    checkVariantsDoc(objAt(spec.variants, 'subcomponents', sub), `/subcomponents/${sub}`, subScope(sub));
  }

  // ---- instanceExamples configure declared props with legal values ----------
  // Same contract as a variant's `configuration`. Unchecked, a stale example
  // (`size: Large` after the enum dropped Large) validates clean and reaches
  // Storybook as a silently wrong story.

  const checkInstanceExamples = (doc: unknown, pathPrefix: string, scope: Scope): void => {
    const examples = objAt(doc, 'instanceExamples');
    for (const [exampleName, example] of Object.entries(examples)) {
      const configs = objAt(example, 'propConfigurations');
      for (const [prop, value] of Object.entries(configs)) {
        if (prop === '$nested') continue;
        const path = `${pathPrefix}/instanceExamples/${exampleName}/propConfigurations/${prop}`;
        const decl = scope.props[prop];
        if (!isObj(decl)) {
          findings.push({ file: 'examples', path, message: `prop "${prop}" is not declared in props` });
          continue;
        }
        if (value === null || isObj(value)) continue; // unset, or a $slotContent fill
        if (decl.type === 'boolean' && typeof value !== 'boolean') {
          findings.push({ file: 'examples', path, message: `prop "${prop}" is boolean; got ${JSON.stringify(value)}` });
        }
        if (Array.isArray(decl.enum) && !(decl.enum as unknown[]).includes(value)) {
          findings.push({ file: 'examples', path, message: `"${String(value)}" is not an allowed value of "${prop}": ${(decl.enum as unknown[]).join(', ')}` });
        }
      }
    }
  };

  checkInstanceExamples(spec.examples, '', mainScope);
  for (const sub of Object.keys(objAt(spec.examples, 'subcomponents'))) {
    checkInstanceExamples(objAt(spec.examples, 'subcomponents', sub), `/subcomponents/${sub}`, subScope(sub));
  }

  // ---- slot content triplets carry their own anatomy ------------------------

  const checkTriplets = (holder: Obj, pathPrefix: string): void => {
    for (const [exampleName, triplet] of Object.entries(holder)) {
      if (!isObj(triplet)) continue;
      const scope = new Set(Object.keys(objAt(triplet, 'anatomy')));
      const names = new Set<string>();
      layoutNames(triplet.layout, names);
      for (const n of [...names].sort()) {
        if (!scope.has(n)) {
          findings.push({ file: 'examples', path: `${pathPrefix}/${exampleName}/layout`, message: `layout element "${n}" is not declared in this slot content's anatomy` });
        }
      }
      for (const el of Object.keys(objAt(triplet, 'elements'))) {
        if (!scope.has(el)) {
          findings.push({ file: 'examples', path: `${pathPrefix}/${exampleName}/elements/${el}`, message: `element "${el}" is not declared in this slot content's anatomy` });
        }
      }
    }
  };

  checkTriplets(objAt(spec.examples, 'slotContentExamples'), '/slotContentExamples');
  for (const sub of Object.keys(objAt(spec.examples, 'subcomponents'))) {
    checkTriplets(
      objAt(spec.examples, 'subcomponents', sub, 'slotContentExamples'),
      `/subcomponents/${sub}/slotContentExamples`,
    );
  }

  return findings;
}
