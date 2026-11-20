// Traversal helpers the rule catalogue shares: a deep walk with JSON Pointer
// paths, in-document pointer resolution, and the component-shaped scopes a
// rule evaluates against.

export type Obj = Record<string, unknown>;

export function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function escapeSegment(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Depth-first visit of every node, with its JSON Pointer path. */
export function walk(node: unknown, visit: (value: unknown, path: string) => void, path = ''): void {
  visit(node, path);
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, visit, `${path}/${i}`));
  } else if (isObj(node)) {
    for (const [key, value] of Object.entries(node)) {
      walk(value, visit, `${path}/${escapeSegment(key)}`);
    }
  }
}

/** Resolve `#/a/b` (or `/a/b`) against a document; undefined when any segment is missing. */
export function resolvePointer(doc: unknown, pointer: string): unknown {
  const body = pointer.startsWith('#') ? pointer.slice(1) : pointer;
  if (body === '') return doc;
  if (!body.startsWith('/')) return undefined;
  let node: unknown = doc;
  for (const raw of body.slice(1).split('/')) {
    const segment = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(node)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      node = node[index];
    } else if (isObj(node)) {
      node = node[segment];
    } else {
      return undefined;
    }
    if (node === undefined) return undefined;
  }
  return node;
}

/**
 * Whether a pointer is rooted in the workspace rather than this document —
 * `#/components/…` or `#/compositions/…`, or a `<file>#/…` form. A single
 * document cannot resolve those; a workspace-aware caller (the CLI's
 * reference layer) can and does.
 */
export function isWorkspacePointer(pointer: string): boolean {
  return !pointer.startsWith('#') || /^#\/(components|compositions)\//.test(pointer);
}

/**
 * One component-shaped scope: the document's main body, or one subcomponent.
 * A `#/props/<name>` pointer inside `subcomponents.<n>` resolves against that
 * subcomponent's own props, never the component's (ADR-091).
 */
export interface Scope {
  /** JSON Pointer base: '' for the main scope, `/subcomponents/<key>` otherwise. */
  base: string;
  node: Obj;
}

export function componentScopes(doc: unknown): Scope[] {
  if (!isObj(doc)) return [];
  const scopes: Scope[] = [{ base: '', node: doc }];
  const subs = doc.subcomponents;
  if (isObj(subs)) {
    for (const [key, sub] of Object.entries(subs)) {
      if (isObj(sub)) scopes.push({ base: `/subcomponents/${escapeSegment(key)}`, node: sub });
    }
  }
  return scopes;
}

/** The scope a path belongs to — the deepest scope whose base prefixes it. */
export function owningScope(scopes: Scope[], path: string): Scope {
  let owner = scopes[0];
  for (const scope of scopes) {
    if (scope.base !== '' && (path === scope.base || path.startsWith(`${scope.base}/`))) owner = scope;
  }
  return owner;
}

/**
 * One anatomy with the element maps presenting it — the pairing rules like
 * DSPEC-07 and DSPEC-27 evaluate. A component scope pairs its anatomy with
 * `default.elements` and each variant's; a SlotContent or Composition entry
 * pairs its own triplet.
 */
export interface Triplet {
  anatomy: Obj;
  elements: Obj;
  /** JSON Pointer base of the elements map. */
  base: string;
}

export function triplets(scope: Scope): Triplet[] {
  const out: Triplet[] = [];
  const anatomy = isObj(scope.node.anatomy) ? scope.node.anatomy : undefined;
  if (anatomy) {
    const def = scope.node.default;
    if (isObj(def) && isObj(def.elements)) {
      out.push({ anatomy, elements: def.elements, base: `${scope.base}/default/elements` });
    }
    const variants = scope.node.variants;
    if (Array.isArray(variants)) {
      variants.forEach((variant, i) => {
        if (isObj(variant) && isObj(variant.elements)) {
          out.push({ anatomy, elements: variant.elements, base: `${scope.base}/variants/${i}/elements` });
        }
      });
    }
    // A composition concern or Composition entry carries elements beside
    // anatomy directly, with no variant wrapper.
    if (isObj(scope.node.elements)) {
      out.push({ anatomy, elements: scope.node.elements, base: `${scope.base}/elements` });
    }
  }
  for (const [registryKey, registry] of [
    ['slotContentExamples', scope.node.slotContentExamples],
    ['slotContent', scope.node.slotContent],
  ] as const) {
    if (!isObj(registry)) continue;
    for (const [key, entry] of Object.entries(registry)) {
      if (isObj(entry) && isObj(entry.anatomy) && isObj(entry.elements)) {
        out.push({
          anatomy: entry.anatomy,
          elements: entry.elements,
          base: `${scope.base}/${registryKey}/${escapeSegment(key)}/elements`,
        });
      }
    }
  }
  return out;
}

/** The top-level element keys of a layout — a string root, or a branch object's keys. */
export function layoutRoots(layout: unknown): string[] {
  if (!Array.isArray(layout)) return [];
  const roots: string[] = [];
  for (const node of layout) {
    if (typeof node === 'string') roots.push(node);
    else if (isObj(node)) roots.push(...Object.keys(node));
  }
  return roots;
}
