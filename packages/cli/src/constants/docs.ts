/**
 * The documentation site's base URL.
 *
 * Printed in command output and error guidance, so it reaches users as a
 * clickable link. Kept here rather than inlined at each call site: the domain
 * moved once already (specsplugin.com → spectacular.systems) and a literal
 * spread across a dozen files is what made that a sixty-site edit.
 *
 * The YAML config templates and the shipped skills under `src/skills/` carry
 * the literal instead — they are authored documents, not code, and reading a
 * constant out of them would cost more than it saves.
 */
export const DOCS_BASE_URL = 'https://spectacular.systems';
