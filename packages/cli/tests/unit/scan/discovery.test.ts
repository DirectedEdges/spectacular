/**
 * Unit tests for ComponentDiscovery utility
 * 
 * Tests component discovery and filtering logic for audit commands.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { ComponentDiscovery } from '../../../src/scan/discovery.js';

describe('ComponentDiscovery', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'tests', 'tmp', `discovery-${Date.now()}`);
    fs.ensureDirSync(testDir);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.removeSync(testDir);
    }
  });

  describe('File loading', () => {
    it('should load and parse JSON file', async () => {
      const filePath = path.join(testDir, 'library.json');
      const data = {
        name: 'Test Library',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: []
        }
      };

      fs.writeJSONSync(filePath, data);

      const discovery = await ComponentDiscovery.fromFile(filePath);
      expect(discovery.getFileName()).toBe('Test Library');
    });

    it('should throw error for missing document property', async () => {
      const filePath = path.join(testDir, 'invalid.json');
      fs.writeJSONSync(filePath, { name: 'Invalid' });

      await expect(ComponentDiscovery.fromFile(filePath))
        .rejects.toThrow('Invalid file data: missing "document" property');
    });

    it('should throw error for missing type property', async () => {
      const filePath = path.join(testDir, 'invalid.json');
      fs.writeJSONSync(filePath, {
        document: { id: '0:0', name: 'Doc' }
      });

      await expect(ComponentDiscovery.fromFile(filePath))
        .rejects.toThrow('Invalid document: missing "type" property');
    });
  });

  describe('Component discovery', () => {
    it('should find standalone COMPONENT nodes', async () => {
      const filePath = path.join(testDir, 'library.json');
      const data = {
        name: 'Test Library',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Page',
              type: 'CANVAS',
              children: [
                {
                  id: '2:1',
                  name: 'Button',
                  type: 'COMPONENT',
                  children: []
                },
                {
                  id: '2:2',
                  name: 'Card',
                  type: 'COMPONENT',
                  children: []
                }
              ]
            }
          ]
        }
      };

      fs.writeJSONSync(filePath, data);

      const discovery = await ComponentDiscovery.fromFile(filePath);
      const components = discovery.findAllComponents();

      expect(components).toHaveLength(2);
      expect(components[0]).toEqual({ id: '2:1', name: 'Button', type: 'COMPONENT', devStatus: 'NONE' });
      expect(components[1]).toEqual({ id: '2:2', name: 'Card', type: 'COMPONENT', devStatus: 'NONE' });
    });

    it('should find COMPONENT_SET nodes', async () => {
      const filePath = path.join(testDir, 'library.json');
      const data = {
        name: 'Test Library',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Page',
              type: 'CANVAS',
              children: [
                {
                  id: '3:1',
                  name: 'Button Set',
                  type: 'COMPONENT_SET',
                  children: [
                    {
                      id: '3:2',
                      name: 'Button/Primary',
                      type: 'COMPONENT',
                      children: []
                    },
                    {
                      id: '3:3',
                      name: 'Button/Secondary',
                      type: 'COMPONENT',
                      children: []
                    }
                  ]
                }
              ]
            }
          ]
        }
      };

      fs.writeJSONSync(filePath, data);

      const discovery = await ComponentDiscovery.fromFile(filePath);
      const components = discovery.findAllComponents();

      expect(components).toHaveLength(1);
      expect(components[0]).toEqual({ id: '3:1', name: 'Button Set', type: 'COMPONENT_SET', devStatus: 'NONE' });
    });

    it('should extract devStatus when present on component nodes', async () => {
      const filePath = path.join(testDir, 'library.json');
      const data = {
        name: 'Test Library',
        lastModified: '2026-05-08T17:48:26Z',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Page',
              type: 'CANVAS',
              children: [
                {
                  id: '397:37',
                  name: 'Ready Set',
                  type: 'COMPONENT_SET',
                  devStatus: { type: 'READY_FOR_DEV', description: '' },
                  children: []
                },
                {
                  id: '397:38',
                  name: 'Idle Set',
                  type: 'COMPONENT_SET',
                  children: []
                }
              ]
            }
          ]
        }
      };

      fs.writeJSONSync(filePath, data);

      const discovery = await ComponentDiscovery.fromFile(filePath);
      const components = discovery.findAllComponents();

      const ready = components.find(c => c.id === '397:37');
      const idle = components.find(c => c.id === '397:38');
      expect(ready?.devStatus).toBe('READY_FOR_DEV');
      expect(idle?.devStatus).toBe('NONE');
      expect(discovery.getFileLastModified()).toBe('2026-05-08T17:48:26Z');
    });

    it('should carry non-READY_FOR_DEV statuses through verbatim', async () => {
      const filePath = path.join(testDir, 'library.json');
      const data = {
        name: 'Test Library',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Page',
              type: 'CANVAS',
              children: [
                {
                  id: '9313:18494',
                  name: 'Text Field',
                  type: 'COMPONENT_SET',
                  devStatus: { type: 'COMPLETED', description: '' },
                  children: []
                },
                {
                  id: '9313:18495',
                  name: 'Future Set',
                  type: 'COMPONENT_SET',
                  devStatus: { type: 'in_review' },
                  children: []
                }
              ]
            }
          ]
        }
      };

      fs.writeJSONSync(filePath, data);

      const discovery = await ComponentDiscovery.fromFile(filePath);
      const components = discovery.findAllComponents();

      expect(components.find(c => c.id === '9313:18494')?.devStatus).toBe('COMPLETED');
      expect(components.find(c => c.id === '9313:18495')?.devStatus).toBe('IN_REVIEW');
    });

    it('should exclude variant children from results', async () => {
      const filePath = path.join(testDir, 'library.json');
      const data = {
        name: 'Test Library',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Page',
              type: 'CANVAS',
              children: [
                {
                  id: '2:1',
                  name: 'Standalone Component',
                  type: 'COMPONENT',
                  children: []
                },
                {
                  id: '3:1',
                  name: 'Variant Set',
                  type: 'COMPONENT_SET',
                  children: [
                    {
                      id: '3:2',
                      name: 'Variant/A',
                      type: 'COMPONENT',
                      children: []
                    },
                    {
                      id: '3:3',
                      name: 'Variant/B',
                      type: 'COMPONENT',
                      children: []
                    }
                  ]
                }
              ]
            }
          ]
        }
      };

      fs.writeJSONSync(filePath, data);

      const discovery = await ComponentDiscovery.fromFile(filePath);
      const components = discovery.findAllComponents();

      // Should only include standalone COMPONENT and COMPONENT_SET, not variant children
      expect(components).toHaveLength(2);

      const ids = components.map(c => c.id);
      expect(ids).toContain('2:1'); // Standalone component
      expect(ids).toContain('3:1'); // Component set
      expect(ids).not.toContain('3:2'); // Variant child (excluded)
      expect(ids).not.toContain('3:3'); // Variant child (excluded)
    });

    it('should handle empty component list', async () => {
      const filePath = path.join(testDir, 'library.json');
      const data = {
        name: 'Empty Library',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Empty Page',
              type: 'CANVAS',
              children: []
            }
          ]
        }
      };

      fs.writeJSONSync(filePath, data);

      const discovery = await ComponentDiscovery.fromFile(filePath);
      const components = discovery.findAllComponents();

      expect(components).toHaveLength(0);
    });
  });
});
