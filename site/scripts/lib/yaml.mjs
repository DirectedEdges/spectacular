/**
 * YAML for a JSON value, covering the subset `examples` holds: scalars, maps
 * and arrays of them.
 *
 * Examples are STORED as JSON, because that is what makes them trustworthy —
 * each one validates against the property it sits on. They are READ as YAML,
 * because that is the form specs are authored in.
 *
 * Deliberately not a YAML library. The quoting below encodes specific things
 * this data does, a library would produce different bytes, and the comments
 * explaining why would go with it.
 */

/**
 * One scalar, quoted whenever leaving it bare would change what it parses as.
 *
 * This is the part that has to be right rather than merely tidy. A naive dump
 * of `backgroundImage`'s example emits `$image: #/images/hero`, where
 * everything from the `#` is a YAML comment and the value is silently empty.
 */
export const yamlScalar = (v) => {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return JSON.stringify(v);
  const s = String(v);
  const needsQuote =
    s === '' ||
    // An indicator in first position: comment, anchor, alias, directive, tag,
    // block scalar, flow collection, quote, or the key/item separators.
    /^[#&*!|>%@`\-?:,[\]{}'"]/.test(s) ||
    // Would parse as something other than a string.
    /^(true|false|null|~|yes|no|on|off)$/i.test(s) ||
    /^[+-]?(\d|\.\d)/.test(s) ||
    // Structural characters anywhere.
    /: |\s#|\n|\t/.test(s) ||
    s !== s.trim();
  return needsQuote ? JSON.stringify(s) : s;
};

export const toYaml = (value, indent = 0) => {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]`;
    // A short run of scalars inline. `components: [1, 0.4, 0]` is one colour,
    // and three bullet lines made it look like three of something.
    if (value.length <= 4 && value.every((x) => x === null || typeof x !== 'object')) {
      return `${pad}[${value.map(yamlScalar).join(', ')}]`;
    }
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          // The dash takes the place of the first two spaces of the item's
          // own indentation, so a nested map hangs off its bullet.
          const body = toYaml(item, indent + 2);
          return `${pad}- ${body.slice(indent + 2)}`;
        }
        return `${pad}- ${yamlScalar(item)}`;
      })
      .join('\n');
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return `${pad}{}`;
    return entries
      .map(([k, v]) => {
        const key = yamlScalar(k);
        if (v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length : Object.keys(v).length)) {
          const body = toYaml(v, indent + 2);
          // A value that rendered to one line belongs on the key's line —
          // `components:` followed by `[1, 0.4, 0]` beneath it read as a
          // block that happened to be short. Arrays only: a single-entry map
          // body is one line too, but inlining it chains the keys into
          // `$extensions: com.figma: visibilityProp: x`, which is not YAML.
          if (!body.includes('\n') && Array.isArray(v)) return `${pad}${key}: ${body.trimStart()}`;
          return `${pad}${key}:\n${body}`;
        }
        return `${pad}${key}: ${toYaml(v, 0)}`;
      })
      .join('\n');
  }
  return `${pad}${yamlScalar(value)}`;
};
