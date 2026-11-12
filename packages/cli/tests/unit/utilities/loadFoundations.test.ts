/**
 * Unit tests for loadFoundations utility
 * 
 * Tests the loading and parsing of variables and styles JSON files
 * into strongly-typed Maps for the transformer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { loadFoundations } from '../../../src/utilities/loadFoundations.js';

describe('loadFoundations', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'tests', 'tmp', `loadFoundations-${Date.now()}`);
    fs.ensureDirSync(testDir);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.removeSync(testDir);
    }
  });

  describe('Variables loading', () => {
    it('should load variables from a single JSON file', async () => {
      const variablesPath = path.join(testDir, 'variables.json');
      const variablesData = {
        meta: {
          variables: {
            'var-1': { name: 'Primary Color', resolvedType: 'COLOR' },
            'var-2': { name: 'Font Size', resolvedType: 'FLOAT' }
          },
          variableCollections: {
            'col-1': { name: 'Theme Colors' }
          }
        }
      };

      fs.writeJSONSync(variablesPath, variablesData);

      const result = await loadFoundations([variablesPath], []);

      expect(result.variables.size).toBe(2);
      expect(result.variables.get('var-1')).toMatchObject({
        id: 'var-1',
        name: 'Primary Color',
        resolvedType: 'COLOR'
      });
      expect(result.variables.get('var-2')).toMatchObject({
        id: 'var-2',
        name: 'Font Size',
        resolvedType: 'FLOAT'
      });

      expect(result.collections.size).toBe(1);
      expect(result.collections.get('col-1')).toMatchObject({
        id: 'col-1',
        name: 'Theme Colors'
      });
    });

    it('should merge variables from multiple JSON files', async () => {
      const vars1Path = path.join(testDir, 'variables1.json');
      const vars2Path = path.join(testDir, 'variables2.json');

      fs.writeJSONSync(vars1Path, {
        meta: {
          variables: {
            'var-1': { name: 'Color 1', resolvedType: 'COLOR' }
          },
          variableCollections: {
            'col-1': { name: 'Collection 1' }
          }
        }
      });

      fs.writeJSONSync(vars2Path, {
        meta: {
          variables: {
            'var-2': { name: 'Color 2', resolvedType: 'COLOR' }
          },
          variableCollections: {
            'col-2': { name: 'Collection 2' }
          }
        }
      });

      const result = await loadFoundations([vars1Path, vars2Path], []);

      expect(result.variables.size).toBe(2);
      expect(result.collections.size).toBe(2);
      expect(result.variables.has('var-1')).toBe(true);
      expect(result.variables.has('var-2')).toBe(true);
      expect(result.collections.has('col-1')).toBe(true);
      expect(result.collections.has('col-2')).toBe(true);
    });

    it('should handle empty variables array', async () => {
      const result = await loadFoundations([], []);

      expect(result.variables.size).toBe(0);
      expect(result.collections.size).toBe(0);
    });

    it('should handle missing meta.variables', async () => {
      const variablesPath = path.join(testDir, 'variables.json');
      fs.writeJSONSync(variablesPath, { meta: {} });

      const result = await loadFoundations([variablesPath], []);

      expect(result.variables.size).toBe(0);
      expect(result.collections.size).toBe(0);
    });
  });

  describe('Styles loading', () => {
    it('should load styles from a single JSON file', async () => {
      const stylesPath = path.join(testDir, 'styles.json');
      const stylesData = {
        meta: {
          styles: [
            { key: 'style-1', name: 'Heading', style_type: 'TEXT', description: 'Main heading' },
            { key: 'style-2', name: 'Primary Fill', style_type: 'FILL' }
          ]
        }
      };

      fs.writeJSONSync(stylesPath, stylesData);

      const result = await loadFoundations([], [stylesPath]);

      expect(result.styles.size).toBe(2);
      expect(result.styles.get('style-1')).toEqual({
        id: 'style-1',
        name: 'Heading',
        type: 'TEXT',
        description: 'Main heading'
      });
      expect(result.styles.get('style-2')).toEqual({
        id: 'style-2',
        name: 'Primary Fill',
        type: 'FILL',
        description: undefined
      });
    });

    it('should merge styles from multiple JSON files', async () => {
      const styles1Path = path.join(testDir, 'styles1.json');
      const styles2Path = path.join(testDir, 'styles2.json');

      fs.writeJSONSync(styles1Path, {
        meta: {
          styles: [
            { key: 'style-1', name: 'Style 1', style_type: 'TEXT' }
          ]
        }
      });

      fs.writeJSONSync(styles2Path, {
        meta: {
          styles: [
            { key: 'style-2', name: 'Style 2', style_type: 'FILL' }
          ]
        }
      });

      const result = await loadFoundations([], [styles1Path, styles2Path]);

      expect(result.styles.size).toBe(2);
      expect(result.styles.has('style-1')).toBe(true);
      expect(result.styles.has('style-2')).toBe(true);
    });

    it('should handle empty styles array', async () => {
      const result = await loadFoundations([], []);

      expect(result.styles.size).toBe(0);
    });

    it('should handle missing meta.styles', async () => {
      const stylesPath = path.join(testDir, 'styles.json');
      fs.writeJSONSync(stylesPath, { meta: {} });

      const result = await loadFoundations([], [stylesPath]);

      expect(result.styles.size).toBe(0);
    });

    it('should handle non-array meta.styles', async () => {
      const stylesPath = path.join(testDir, 'styles.json');
      fs.writeJSONSync(stylesPath, { meta: { styles: {} } });

      const result = await loadFoundations([], [stylesPath]);

      expect(result.styles.size).toBe(0);
    });
  });

  describe('File-seeded styles', () => {
    // A library file that consumes its own published library holds several document
    // entries per published key: the local style, plus one copy for every place a
    // component was pasted from a published version.
    const publishedTextStyle = {
      meta: {
        styles: [
          {
            key: 'key-hash-1',
            node_id: 'local:1',
            name: 'Typography/Body/Medium',
            style_type: 'TEXT',
            $custom: { token: 'body.medium' }
          }
        ]
      }
    };

    const writeStyles = (data: unknown): string => {
      const stylesPath = path.join(testDir, 'styles.json');
      fs.writeJSONSync(stylesPath, data);
      return stylesPath;
    };

    it('should give $custom to every document entry sharing one key', async () => {
      const stylesPath = writeStyles(publishedTextStyle);
      const fileJson = {
        styles: {
          'local:1': { key: 'key-hash-1', name: 'Typography/Body/Medium', styleType: 'TEXT' },
          'copy:2': { key: 'key-hash-1', name: 'Body/Medium', styleType: 'TEXT' },
          'copy:3': { key: 'key-hash-1', name: 'Body/Medium', styleType: 'TEXT' }
        }
      };

      const result = await loadFoundations([], [stylesPath], fileJson);

      for (const id of ['local:1', 'copy:2', 'copy:3']) {
        expect(result.styles.get(id)?.$custom).toEqual({ token: 'body.medium' });
      }
    });

    it('should give $custom to a local entry whose id equals the published node_id', async () => {
      const stylesPath = writeStyles(publishedTextStyle);
      const fileJson = {
        styles: {
          'local:1': { key: 'key-hash-1', name: 'Typography/Body/Medium', styleType: 'TEXT' }
        }
      };

      const result = await loadFoundations([], [stylesPath], fileJson);

      expect(result.styles.get('local:1')?.$custom).toEqual({ token: 'body.medium' });
    });

    it('should not overwrite a $custom already on the document entry', async () => {
      const stylesPath = writeStyles(publishedTextStyle);
      const fileJson = {
        styles: {
          'copy:2': {
            key: 'key-hash-1',
            name: 'Body/Medium',
            styleType: 'TEXT',
            $custom: { token: 'authored.in.file' }
          }
        }
      };

      const result = await loadFoundations([], [stylesPath], fileJson);

      expect(result.styles.get('copy:2')?.$custom).toEqual({ token: 'authored.in.file' });
    });

    it('should leave an entry whose key matches no published style alone', async () => {
      const stylesPath = writeStyles(publishedTextStyle);
      const fileJson = {
        styles: {
          'orphan:9': { key: 'key-hash-unknown', name: 'Orphan', styleType: 'EFFECT' }
        }
      };

      const result = await loadFoundations([], [stylesPath], fileJson);

      expect(result.styles.get('orphan:9')?.name).toBe('Orphan');
      expect(result.styles.get('orphan:9')?.$custom).toBeUndefined();
    });

    it('should skip a document entry with no key, and one with no type', async () => {
      const stylesPath = writeStyles(publishedTextStyle);
      const fileJson = {
        styles: {
          'nokey:7': { name: 'No Key', styleType: 'FILL' },
          'notype:8': { key: 'key-hash-1', name: 'No Type' }
        }
      };

      const result = await loadFoundations([], [stylesPath], fileJson);

      expect(result.styles.get('nokey:7')?.$custom).toBeUndefined();
      expect(result.styles.has('notype:8')).toBe(false);
    });

    it('should seed from several file JSONs, first definition of an id winning', async () => {
      const stylesPath = writeStyles(publishedTextStyle);
      const first = {
        styles: {
          'copy:2': { key: 'key-hash-1', name: 'From First', styleType: 'TEXT' }
        }
      };
      const second = {
        styles: {
          'copy:2': { key: 'key-hash-1', name: 'From Second', styleType: 'TEXT' },
          'copy:3': { key: 'key-hash-1', name: 'Only In Second', styleType: 'TEXT' }
        }
      };

      const result = await loadFoundations([], [stylesPath], [first, second]);

      expect(result.styles.get('copy:2')?.name).toBe('From First');
      expect(result.styles.get('copy:2')?.$custom).toEqual({ token: 'body.medium' });
      expect(result.styles.get('copy:3')?.$custom).toEqual({ token: 'body.medium' });
    });

    it('should seed styles with no styles endpoint present', async () => {
      const fileJson = {
        styles: {
          'copy:2': { key: 'key-hash-1', name: 'Body/Medium', styleType: 'TEXT', description: 'A copy' }
        }
      };

      const result = await loadFoundations([], [], fileJson);

      expect(result.styles.get('copy:2')).toEqual({
        id: 'copy:2',
        name: 'Body/Medium',
        type: 'TEXT',
        description: 'A copy'
      });
    });
  });

  describe('Combined loading', () => {
    it('should load both variables and styles together', async () => {
      const variablesPath = path.join(testDir, 'variables.json');
      const stylesPath = path.join(testDir, 'styles.json');

      fs.writeJSONSync(variablesPath, {
        meta: {
          variables: {
            'var-1': { name: 'Color Var', resolvedType: 'COLOR' }
          },
          variableCollections: {
            'col-1': { name: 'Collection' }
          }
        }
      });

      fs.writeJSONSync(stylesPath, {
        meta: {
          styles: [
            { key: 'style-1', name: 'Text Style', style_type: 'TEXT' }
          ]
        }
      });

      const result = await loadFoundations([variablesPath], [stylesPath]);

      expect(result.variables.size).toBe(1);
      expect(result.collections.size).toBe(1);
      expect(result.styles.size).toBe(1);
    });

    it('should return properly typed Maps', async () => {
      const result = await loadFoundations([], []);

      // Verify the result matches FoundationsData interface
      expect(result).toHaveProperty('styles');
      expect(result).toHaveProperty('variables');
      expect(result).toHaveProperty('collections');

      // Verify these are Maps
      expect(result.styles instanceof Map).toBe(true);
      expect(result.variables instanceof Map).toBe(true);
      expect(result.collections instanceof Map).toBe(true);
    });
  });
});
