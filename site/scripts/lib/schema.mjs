/**
 * Reading a JSON Schema document the way these generators need to read it:
 * names off `$ref`s, and the definition a `$ref` chain ends at.
 */

/**
 * Strips a `$ref` down to its definition name, across files as well as within
 * one.
 *
 * `component.schema.json#/definitions/PropBinding` is a legitimate cross-file
 * reference, and replacing only the literal `#/definitions/` left the filename
 * glued to the type: `component.schema.jsonPropBinding`.
 */
const DEF_PREFIX = /^.*#\/definitions\//;

/**
 * Tolerates a missing `$ref` and passes the absence through, because most
 * callers read `node.$ref` off a node that may not have one and branch on the
 * result.
 */
export const defName = (ref) => ref?.replace(DEF_PREFIX, '');

/**
 * Follow a `$ref` chain to the definition it names, or `null` where it names
 * nothing this document defines.
 *
 * A node with no `$ref` is already resolved and comes back unchanged, so
 * callers can hand this anything.
 *
 * The depth cap is a cycle guard, not a schema limit: a definition that refers
 * to itself through a wrapper would otherwise recurse forever. Five is deeper
 * than any chain in this schema, which is the point — it catches a loop
 * without ever truncating a real one.
 */
export const deref = (defs, node, depth = 0, limit = 5) => {
  if (!node || depth > limit) return node;
  if (node.$ref) {
    const t = defName(node.$ref);
    return defs[t] ? deref(defs, defs[t], depth + 1, limit) : null;
  }
  return node;
};
