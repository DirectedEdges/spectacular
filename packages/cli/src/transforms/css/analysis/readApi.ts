// Reading the few facts the stylesheet needs out of `api.yaml` (specs#691).
//
// Each one narrows an untyped document to the one shape a rule asks about, so no
// rule has to know the document's layout.
import type { TransformerContext } from '../../../transforms/transformer.js';

/** api.yaml anatomy → element key → type ("container" | "rectangle" | "ellipse" | "vector" | "text" | …). */
export function anatomyTypes(apiYaml: Record<string, unknown>): Record<string, string> {
  const anatomy = (apiYaml.anatomy ?? {}) as Record<string, Record<string, unknown>>;
  const types: Record<string, string> = {};
  for (const [key, entry] of Object.entries(anatomy)) {
    if (entry && typeof entry.type === 'string') types[key] = entry.type;
  }
  return types;
}

/** api.yaml anatomy → element key → behavior role (ADR-067), where one is annotated. */
export function anatomyRoles(apiYaml: Record<string, unknown>): Record<string, string> {
  const anatomy = (apiYaml.anatomy ?? {}) as Record<string, Record<string, unknown>>;
  const roles: Record<string, string> = {};
  for (const [key, entry] of Object.entries(anatomy)) {
    if (entry && typeof entry.role === 'string') roles[key] = entry.role;
  }
  return roles;
}

/** api.yaml props, keyed by prop name. */
export function apiPropsOf(apiYaml: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return (apiYaml.props ?? {}) as Record<string, Record<string, unknown>>;
}

/**
 * Whether this component declares the prop a state concept is classified to.
 *
 * Deterministic in two steps, both over declared data: the workspace's `states`
 * config names the prop (and optionally the enum value) that carries the concept,
 * and the component's own props either declare that prop or do not. Where the
 * classification names a value, the prop's enum must actually offer it — a
 * mapping pointing at a value no variant produces is dead and must not count.
 * Value comparison is case-insensitive, matching how the state lookup resolves.
 */
export function declaresState(
  context: TransformerContext,
  apiProps: Record<string, Record<string, unknown>>,
  concept: string,
): boolean {
  const entry = (context.processingStates ?? {})[concept];
  if (!entry?.prop) return false;
  const prop = apiProps[entry.prop];
  if (!prop) return false;
  if (entry.value == null) return true;
  const values = Array.isArray(prop.enum) ? (prop.enum as unknown[]) : null;
  if (!values) return true; // a boolean prop carries no enum to check
  return values.some(v => String(v).toLowerCase() === String(entry.value).toLowerCase());
}
