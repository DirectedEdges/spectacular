/**
 * Foundations data loading utilities for CLI environment
 * 
 * Provides functions to load and parse variables and styles JSON files
 * into strongly-typed Maps that can be passed to the transformer.
 * 
 * @packageDocumentation
 */

import fs from 'fs-extra';
import type { StylesMap, VariablesMap, CollectionsMap } from '@directededges/specs-from-figma';

/**
 * Container for all foundations data (styles, variables, collections)
 */
export interface FoundationsData {
  /** Map of style ID to style metadata */
  styles: StylesMap;
  /** Map of variable ID to variable metadata */
  variables: VariablesMap;
  /** Map of collection ID to collection metadata */
  collections: CollectionsMap;
}

/**
 * Load and parse variables and styles JSON files into typed Maps
 * 
 * This function handles all file I/O and parsing for foundations data,
 * building the strongly-typed Maps required by Component.fromRestApi().
 * 
 * Styles are loaded from two sources:
 * 1. File JSON seed (fileJson.styles) — provides file-local style IDs used by component node references
 * 2. Styles endpoint files (stylePaths) — { meta: { styles: [...] } } Figma REST API format,
 *    indexed by node_id (primary) and key hash (secondary) for flexible lookup
 *
 * After loading, seeded entries are enriched with $custom from the styles endpoint via shared key hash.
 * A library file that consumes its own published library holds SEVERAL document entries per published
 * key — the local style plus one copy for each place a component was pasted from a published version —
 * so every entry sharing a key is enriched, not just one.
 *
 * @param variablePaths - Array of file paths to variables JSON files
 * @param stylePaths - Array of file paths to styles JSON files
 * @param fileJson - Optional library file JSON (or several) to seed styles from, handling
 *                   remote/published style references. With several, the first to define a
 *                   style id wins.
 * @returns Object containing styles, variables, and collections Maps
 *
 * @example
 * ```typescript
 * const libraryJson = await fs.readJSON('./data/library.file.json');
 * const { styles, variables, collections } = await loadFoundations(
 *   ['./data/library.variables.json'],
 *   ['./data/library.styles.json', './data/foundations.styles.json'],
 *   libraryJson
 * );
 * 
 * const component = Component.fromRestApi(libraryJson, componentId, conventions, settings, {
 *   coordinator,
 *   styles,
 *   variables,
 *   collections
 * });
 * ```
 */
export async function loadFoundations(
  variablePaths: string[],
  stylePaths: string[],
  fileJson?: Record<string, any> | Array<Record<string, any>>
): Promise<FoundationsData> {
  const styles: StylesMap = new Map();
  const variables: VariablesMap = new Map();
  const collections: CollectionsMap = new Map();

  // Seed styles from the file itself (handles remote/published style references in components).
  // Every (styleId, key hash) pair is recorded, not one id per key: several document entries
  // legitimately share a key, and all of them need the published entry's $custom.
  const seededKeys: Array<[styleId: string, keyHash: string]> = [];
  const fileJsons = fileJson == null ? [] : Array.isArray(fileJson) ? fileJson : [fileJson];
  for (const fj of fileJsons) {
    if (!fj?.styles || typeof fj.styles !== 'object') continue;
    for (const [styleId, s] of Object.entries<any>(fj.styles)) {
      if (!styleId || styles.has(styleId)) continue;
      const type = s?.styleType || s?.type;
      if (!type) continue;

      if (s?.key) seededKeys.push([styleId, s.key]);

      styles.set(styleId, {
        id: styleId,
        name: s?.name || styleId,
        type,
        description: s?.description,
        ...(s?.$custom != null ? { $custom: s.$custom } : {})
      });
    }
  }

  // Load variables JSON files
  for (const path of variablePaths) {
    const json = await fs.readJSON(path);
    
    // Parse variables from meta.variables
    if (json.meta?.variables) {
      for (const [id, varDef] of Object.entries<any>(json.meta.variables)) {
        variables.set(id, {
          id,
          name: varDef.name,
          key: varDef.key ?? id,
          variableCollectionId: varDef.variableCollectionId ?? '',
          resolvedType: varDef.resolvedType,
          valuesByMode: varDef.valuesByMode ?? {},
          remote: Boolean(varDef.remote),
          description: varDef.description,
          scopes: Array.isArray(varDef.scopes) ? varDef.scopes : undefined,
          codeSyntax: varDef.codeSyntax,
          ...(varDef.$custom != null ? { $custom: varDef.$custom } : {})
        });
      }
    }
    
    // Parse collections from meta.variableCollections
    if (json.meta?.variableCollections) {
      for (const [id, colDef] of Object.entries<any>(json.meta.variableCollections)) {
        const modes = Array.isArray(colDef.modes) ? colDef.modes : [];
        const defaultModeId = colDef.defaultModeId ?? (modes[0]?.modeId ?? '');
        collections.set(id, {
          id,
          name: colDef.name,
          key: colDef.key ?? id,
          modes,
          defaultModeId,
          variableIds: Array.isArray(colDef.variableIds) ? colDef.variableIds : [],
          remote: Boolean(colDef.remote)
        });
      }
    }
  }
  
  // Load styles from REST API endpoint files: { meta: { styles: [...] } }
  for (const path of stylePaths) {
    const json = await fs.readJSON(path);

    if (json.meta?.styles && Array.isArray(json.meta.styles)) {
      for (const s of json.meta.styles) {
        const primaryId = s.node_id || s.key;
        if (!primaryId) continue;

        const styleDef = {
          id: primaryId,
          name: s.name,
          type: s.style_type,
          description: s.description,
          ...(s.$custom != null ? { $custom: s.$custom } : {})
        };

        // Primary lookup: node_id (matches component references)
        styles.set(primaryId, styleDef);

        // Secondary lookup: key hash (bridges to file-seeded entries)
        if (s.key && s.key !== primaryId) {
          styles.set(s.key, styleDef);
        }
      }
    }
  }

  // Reconcile: enrich file-seeded entries with $custom from styles endpoint via shared key hash
  for (const [styleId, keyHash] of seededKeys) {
    const seeded = styles.get(styleId);
    const keyEntry = styles.get(keyHash);
    if (seeded && keyEntry?.$custom && !seeded.$custom) {
      seeded.$custom = keyEntry.$custom;
    }
  }

  return { styles, variables, collections };
}
