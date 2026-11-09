/**
 * Renders packages/schema/SPECIFICATION.md as a Starlight page at
 * /schema/specification. The package file is the source of truth; this
 * script only wraps it in frontmatter. Run before `astro dev` or
 * `astro build`, alongside build-adrs.mjs.
 *
 * Usage:  node scripts/build-specification.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { docs, pkg } from './lib/paths.mjs';

const src = join(pkg, 'SPECIFICATION.md');
const out = join(docs, 'schema/specification.md');

const md = readFileSync(src, 'utf8');

// Starlight renders the frontmatter title as the H1; drop the source's own.
const body = md.replace(/^# .+\n/, '');

const version = body.match(/\*\*Version ([\d.]+)/)?.[1] ?? '';

const page = `---
title: "Specification"
description: "The normative specification for the Specs document format — requirement language, conformance classes, identifiers, pointers, slots, extensions, versioning, and the semantic rule catalogue"
---

<!-- Generated from packages/schema/SPECIFICATION.md (v${version}) by scripts/build-specification.mjs — edit the source, not this file. -->

${body}`;

writeFileSync(out, page);
console.log(`specification: wrote /schema/specification (v${version})`);
