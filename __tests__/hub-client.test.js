/**
 * Tests for Hub client, template installer, and template updater modules.
 *
 * Uses mocked HTTP responses to test API interactions without
 * requiring a real Hub backend.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { HubClient } from '../src/hub/hub-client.js';
import {
  extractVariables,
  resolveVariables,
  buildVariableValues,
  buildSourceHeader,
} from '../src/hub/template-installer.js';

// --- Template variable tests ---

describe('extractVariables', () => {
  it('should extract unique variable names from template', () => {
    const content = 'name: "{{project_name}} Backup"\ndir: "{{project_dir}}"';
    const vars = extractVariables(content);
    assert.deepStrictEqual(vars, ['project_name', 'project_dir']);
  });

  it('should return empty array when no variables found', () => {
    const vars = extractVariables('name: "Simple Task"');
    assert.deepStrictEqual(vars, []);
  });

  it('should deduplicate repeated variables', () => {
    const content = '{{name}} and {{name}} and {{other}}';
    const vars = extractVariables(content);
    assert.deepStrictEqual(vars, ['name', 'other']);
  });
});

describe('resolveVariables', () => {
  it('should replace placeholders with values', () => {
    const content = 'name: "{{project}} Backup"';
    const result = resolveVariables(content, { project: 'MyApp' });
    assert.equal(result, 'name: "MyApp Backup"');
  });

  it('should keep unresolved placeholders unchanged', () => {
    const content = '{{known}} and {{unknown}}';
    const result = resolveVariables(content, { known: 'yes' });
    assert.equal(result, 'yes and {{unknown}}');
  });

  it('should handle empty values map', () => {
    const content = '{{var}}';
    const result = resolveVariables(content, {});
    assert.equal(result, '{{var}}');
  });
});

describe('buildVariableValues', () => {
  it('should use user-provided values over defaults', () => {
    const schema = [{ name: 'dir', default: '/tmp' }];
    const { values } = buildVariableValues(schema, { dir: '/home' });
    assert.equal(values.dir, '/home');
  });

  it('should fall back to defaults when no user value', () => {
    const schema = [{ name: 'dir', default: '/tmp' }];
    const { values } = buildVariableValues(schema, {});
    assert.equal(values.dir, '/tmp');
  });

  it('should warn about required variables without values', () => {
    const schema = [{ name: 'api_key', required: true }];
    const { warnings } = buildVariableValues(schema, {});
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('api_key'));
  });

  it('should return no warnings when all required vars provided', () => {
    const schema = [{ name: 'key', required: true }];
    const { warnings } = buildVariableValues(schema, { key: 'val' });
    assert.equal(warnings.length, 0);
  });
});

describe('buildSourceHeader', () => {
  it('should include slug and version', () => {
    const header = buildSourceHeader('ai/claude-review', '1.2.0');
    assert.ok(header.includes('hub:ai/claude-review@1.2.0'));
  });

  it('should include author when provided', () => {
    const header = buildSourceHeader('test/slug', '1.0', 'tien');
    assert.ok(header.includes('# author: tien'));
  });

  it('should include tags when provided', () => {
    const header = buildSourceHeader('test/slug', '1.0', null, ['ai', 'tool']);
    assert.ok(header.includes('# tags: [ai, tool]'));
  });

  it('should omit version when not provided', () => {
    const header = buildSourceHeader('test/slug');
    assert.ok(header.includes('hub:test/slug'));
    assert.ok(!header.includes('@'));
  });
});

// --- HubClient construction tests ---

describe('HubClient', () => {
  it('should use default Hub URL', () => {
    const client = new HubClient();
    assert.ok(client.baseUrl.includes('hub.autoshell.dev'));
  });

  it('should store auth token', () => {
    const client = new HubClient('test-token');
    assert.equal(client.authToken, 'test-token');
  });

  it('should build headers without auth when no token', () => {
    const client = new HubClient();
    const headers = client._headers();
    assert.equal(headers['Content-Type'], 'application/json');
    assert.equal(headers['Authorization'], undefined);
  });

  it('should build headers with Bearer auth when token set', () => {
    const client = new HubClient('my-token');
    const headers = client._headers();
    assert.equal(headers['Authorization'], 'Bearer my-token');
  });
});
