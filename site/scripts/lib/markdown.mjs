/**
 * The markdown shapes every generated page is built out of.
 *
 * Structure only — no sentences. A heading's text comes from the generator or
 * from `content/`; what lives here is how a frontmatter block, a table, or a
 * quoted scalar is spelled.
 */

/**
 * Quote a string as a YAML double-quoted scalar.
 *
 * Used for frontmatter values, which is a different job from
 * `yaml.mjs`'s `yamlScalar`: that one decides *whether* to quote a value in a
 * document body, this one always quotes and escapes what it is given.
 */
export const quoteScalar = (text) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * A page's frontmatter block.
 *
 * There were four near-identical versions of this. Two escaped the quote in a
 * description and clamped it to 300 characters, one did neither, and one was
 * written inline in a page template. Both behaviours are adopted here: a
 * description carrying an unescaped `"` produces invalid frontmatter, and the
 * clamp is what keeps a schema description from becoming the whole meta tag.
 *
 * `extra` carries the occasional additional key — `tableOfContents: false` on
 * the ADR index — rather than every caller rebuilding the block to add one.
 */
export const frontmatter = ({ title, description, extra = {} }) =>
  [
    '---',
    `title: ${quoteScalar(title)}`,
    description === undefined || description === null
      ? null
      : `description: ${quoteScalar(String(description).slice(0, 300))}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    '---',
  ]
    .filter((line) => line !== null)
    .join('\n');

/**
 * There is deliberately no `table()` helper here.
 *
 * One was written, on the reasoning that the `|---|---|` separator is
 * hand-written at roughly fifteen sites and that no generator escapes a `|`
 * inside a cell, so a description containing one would split its row.
 *
 * The second half turned out not to be true of any current page: across all
 * 265 generated pages exactly one table row carries an unescaped pipe, and it
 * comes through verbatim from the body of `adr/078-conventions-file-per-
 * platform.md`, where the author wrote `conventions|settings|pipeline` in a
 * cell. That is an authoring error in a record, not something a generator can
 * fix — `build-adrs.mjs` passes ADR markdown through, as it should.
 *
 * So a helper would have meant retrofitting fifteen byte-exact call sites to
 * guard against a defect that does not occur. Add it when a generator builds a
 * cell out of data that could contain a pipe; until then an unused helper in a
 * shared module is just something else to keep true.
 */
