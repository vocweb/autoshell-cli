/**
 * Tests for utility modules: platform, task-id, paths.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPlatform } from '../src/utils/platform.js';
import { taskId } from '../src/utils/task-id.js';
import { paths } from '../src/utils/paths.js';

describe('getPlatform', () => {
  it('returns a valid platform string', () => {
    const p = getPlatform();
    assert.ok(['darwin', 'linux', 'win32'].includes(p));
  });
});

describe('taskId', () => {
  it('converts simple name to lowercase kebab', () => {
    assert.equal(taskId('Brainstorm Frontend'), 'brainstorm-frontend');
  });

  it('strips special characters', () => {
    assert.equal(taskId('Test! @#$ Name'), 'test-name');
  });

  it('removes leading and trailing dashes', () => {
    assert.equal(taskId('  --edge-- '), 'edge');
  });

  it('strips unicode characters (known limitation)', () => {
    assert.equal(taskId('Brainstorm chức năng'), 'brainstorm-ch-c-n-ng');
  });

  it('returns "unnamed" for empty result', () => {
    assert.equal(taskId('!!!'), 'unnamed');
  });
});

describe('paths', () => {
  it('root ends with .autoshell', () => {
    assert.ok(paths.root.endsWith('.autoshell'));
  });

  it('scripts is under root', () => {
    assert.ok(paths.scripts.startsWith(paths.root));
  });

  it('logs is under root', () => {
    assert.ok(paths.logs.startsWith(paths.root));
  });

  it('meta is under root', () => {
    assert.ok(paths.meta.startsWith(paths.root));
  });

  it('commands is under root', () => {
    assert.ok(paths.commands.startsWith(paths.root));
  });
});
