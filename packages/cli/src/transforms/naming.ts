// Name shaping shared by the transform layer.
//
// `toPascalCase` was privately duplicated in Contract.ts and Css.ts, and the
// transform command needs it too — to derive a component's directory inside a
// platform tree. Three copies of a naming rule is how two of them drift, so it
// lives here.
//
// `@directededges/from-specs` carries its own copy for the closed emitters. Which
// of the two is authoritative is the open cross-repo question project 024 has to
// settle; until it does, these must agree.

/** `dsButton` → `DsButton`, `ds-button` → `DsButton`. */
export function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, c => c.toUpperCase());
}

/** `dsButton` → `ds-button`. */
export function toKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}

/**
 * First character upper-cased, and nothing else.
 *
 * Deliberately not {@link toPascalCase}, which also splits on separators. This
 * operates on keys that are already camelCase, and routing them through the
 * fuller conversion would change the directory and file names the stylesheets
 * are written to. It sat inside `Css.ts` under the name `toPascalCase` for a
 * long time while doing something different — the names are side by side here so
 * the difference is visible rather than surprising.
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * The composite key a subcomponent is named by: the parent's key with the
 * subcomponent's key appended ("deCard" + "reviews" → "deCardReviews").
 *
 * A subcomponent's emitted names compose the parent because they share one flat
 * namespace — a stylesheet, a module scope, the custom element registry — while
 * its directory does not, because the parent directory already namespaces it.
 *
 * The emitters in `@directededges/from-specs` carry the matching helper, and the
 * two must agree: the class this produces is the selector for markup they emit.
 */
export function subComponentKey(parentKey: string, subKey: string): string {
  return `${parentKey}${toPascalCase(subKey)}`;
}
