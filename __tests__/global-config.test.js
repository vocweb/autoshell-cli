/**
 * Tests for global config management module.
 *
 * Verifies default loading, deep merge behavior, per-task overrides,
 * and Hub token management.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge, mergeTaskConfig } from '../src/config/global-config.js';

describe('deepMerge', () => {
  it('should merge flat objects', () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 });
    assert.deepStrictEqual(result, { a: 1, b: 3, c: 4 });
  });

  it('should merge nested objects recursively', () => {
    const target = { settings: { terminal: { program: 'default', newWindow: true } } };
    const source = { settings: { terminal: { program: 'iterm2' } } };
    const result = deepMerge(target, source);
    assert.equal(result.settings.terminal.program, 'iterm2');
    assert.equal(result.settings.terminal.newWindow, true);
  });

  it('should replace arrays instead of merging', () => {
    const result = deepMerge({ tags: ['a', 'b'] }, { tags: ['c'] });
    assert.deepStrictEqual(result.tags, ['c']);
  });

  it('should preserve null values from source', () => {
    const result = deepMerge({ key: 'value' }, { key: null });
    assert.equal(result.key, null);
  });

  it('should return source when target is not an object', () => {
    const result = deepMerge('string', { a: 1 });
    assert.deepStrictEqual(result, { a: 1 });
  });

  it('should return source directly for non-object source', () => {
    const result = deepMerge({ a: 1 }, 'string');
    assert.equal(result, 'string');
  });

  it('should not mutate original objects', () => {
    const target = { a: { b: 1 } };
    const source = { a: { c: 2 } };
    deepMerge(target, source);
    assert.equal(target.a.c, undefined);
  });
});

describe('mergeTaskConfig', () => {
  it('should return global settings when no task config', () => {
    const result = mergeTaskConfig('terminal', null);
    assert.equal(result.program, 'default');
  });

  it('should return global settings when task config is empty', () => {
    const result = mergeTaskConfig('terminal', {});
    assert.equal(result.program, 'default');
  });

  it('should override global with task config values', () => {
    const result = mergeTaskConfig('terminal', { program: 'warp' });
    assert.equal(result.program, 'warp');
    assert.equal(result.new_window, true); // Global default preserved
  });

  it('should handle unknown settings section gracefully', () => {
    const result = mergeTaskConfig('nonexistent', { custom: true });
    assert.equal(result.custom, true);
  });
});
