/**
 * A style page's examples: where they come from, and which of two shapes each
 * one takes.
 *
 * Returns the parts rather than a rendered section, because the union value
 * section consumes them too — it keys each example to the form it illustrates,
 * and only what no form claimed falls through to an `Examples` section of its
 * own. So this computes once and both readers draw on it.
 */

import { toYaml } from '../../lib/yaml.mjs';
import { settingsSentence } from '../../content/style-pages.mjs';

/**
 * Examples come from the schema's own `examples` keyword where it has one.
 * Those are real JSON values, validated against the property they sit on, so a
 * reader can copy one into a document. The preserved display strings are the
 * fallback for anything the schema does not yet carry — they were a rendering
 * of a value rather than the value, and could not be checked.
 */
export const exampleParts = ({ spec, kept, namedTypes, formOf, rehome }) => {
  // Examples preserved from the replaced pages, rendered as object literals.
  const asObject = (e) =>
    e.includes('<br>') && /`[A-Za-z$]+:/.test(e)
      ? `\`{ ${e.split('<br>').map((x) => x.replace(/`/g, '').trim()).join(', ')} }\``
      : e;

  const schemaExamples = Array.isArray(spec.examples) ? spec.examples : null;

  /**
   * Preserved rows whose `Type` the schema still admits.
   *
   * These came from the hand-written pages and are not validated against
   * anything, so they outlive the contract: `clipsContent` kept a
   * `TokenReference` row after its value narrowed to a bare `boolean`, which is
   * a page advertising a value the schema rejects.
   */
  const admittedTypeNames = new Set(namedTypes(spec).map((t) => t.replace(/`/g, '')));
  const exampleRows = (kept.typeExamples ?? []).filter((r) => {
    const named = String(r.type ?? '').match(/`([^`]+)`|\[`([^`]+)`\]/);
    const name = named?.[1] ?? named?.[2];
    return !name || admittedTypeNames.has(name);
  });
  const anySettings = !schemaExamples && exampleRows.some((r) => r.settings);

  /**
   * A scalar stays a table row; a composite becomes a YAML block.
   *
   * One line of JSON in a table cell is unreadable past about four keys —
   * `shadows`' two-shadow example is 180 characters of punctuation in a cell
   * that cannot wrap. YAML fixes that and cannot go in a cell at all, being
   * multi-line. But eleven fenced blocks for `backgroundColor`, whose examples
   * are mostly colour strings, is a worse page than the table it replaced.
   *
   * So the value's own shape decides, and a page carrying both gets the table
   * first and the blocks after it.
   */
  const isComposite = (v) => v !== null && typeof v === 'object';
  const scalarExamples = (schemaExamples ?? []).filter((ex) => !isComposite(ex));
  const compositeExamples = (schemaExamples ?? []).filter(isComposite);

  const examples = schemaExamples
    ? scalarExamples.map((ex) => `| \`${JSON.stringify(ex)}\` | ${formOf(ex, spec)} |`)
    : exampleRows.map(
        (r) => `| ${rehome(r.type)} | ${rehome(asObject(r.example))} |${anySettings ? ` ${rehome(r.settings) ?? '—'} |` : ''}`
      );

  /**
   * Each composite labelled with the type it is, because that is what the
   * table's `Type` column carried and a fenced block has no columns.
   */
  const exampleBlocks = compositeExamples
    .map((ex) => {
      // The label names which form the value takes, which only means something
      // where there is more than one. On a plain object or array page it read
      // `**object**` or `**array**` above every block.
      const label = Array.isArray(spec.oneOf ?? spec.anyOf) ? `**${formOf(ex, spec)}**\n\n` : '';
      return `${label}\`\`\`yaml\n${toYaml(ex)}\n\`\`\``;
    })
    .join('\n\n');

  const exampleHead = schemaExamples
    // "Type", matching the section above that lists them. The column names
    // which of the admitted types the example value is, and calling the same
    // set "forms" here and "types" there made them read as two taxonomies.
    ? '| Example | Type |\n|---|---|'
    : anySettings
      ? '| Type | Example | Settings |\n|---|---|---|'
      : '| Type | Example |\n|---|---|';

  /**
   * The config that selects between a key's value forms, where one does. It
   * annotated the replaced pages' example table and is not derivable, so it
   * survives as a line under the table rather than as a column the schema's own
   * examples have no cell for.
   */
  const settingsNote =
    schemaExamples && exampleRows.some((r) => r.settings)
      ? `\n${settingsSentence([...new Set(exampleRows.filter((r) => r.settings).map((r) => rehome(r.settings)))].join(' and '))}\n`
      : '';

  return {
    schemaExamples,
    exampleRows,
    anySettings,
    scalarExamples,
    compositeExamples,
    examples,
    exampleBlocks,
    exampleHead,
    settingsNote,
  };
};
