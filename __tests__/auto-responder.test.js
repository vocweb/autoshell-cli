/**
 * Tests for interactive auto-responder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAutoResponder } from '../src/interactive/auto-responder.js';

describe('createAutoResponder', () => {
  it('returns null for empty config', () => {
    const responder = createAutoResponder([]);
    assert.equal(responder('any text'), null);
  });

  it('returns null for null config', () => {
    const responder = createAutoResponder(null);
    assert.equal(responder('any text'), null);
  });

  it('matches substring prompt', () => {
    const responder = createAutoResponder([
      { prompt: 'Allow access', response: 'yes' },
    ]);
    assert.equal(responder('Claude wants to read .env. Allow access? (yes/no)'), 'yes');
  });

  it('returns null for non-matching line', () => {
    const responder = createAutoResponder([
      { prompt: 'Allow access', response: 'yes' },
    ]);
    assert.equal(responder('Processing files...'), null);
  });

  it('matches regex prompt', () => {
    const responder = createAutoResponder([
      { prompt: 'Continue\\?', response: 'y' },
    ]);
    assert.equal(responder('Do you want to Continue?'), 'y');
  });

  it('matches case-insensitively', () => {
    const responder = createAutoResponder([
      { prompt: 'allow', response: 'yes' },
    ]);
    assert.equal(responder('ALLOW ACCESS'), 'yes');
  });

  it('returns first matching response', () => {
    const responder = createAutoResponder([
      { prompt: 'first', response: 'a' },
      { prompt: 'second', response: 'b' },
    ]);
    assert.equal(responder('this is the first match'), 'a');
  });

  it('handles multiple rules independently', () => {
    const responder = createAutoResponder([
      { prompt: 'Allow', response: 'yes' },
      { prompt: 'Continue', response: 'y' },
    ]);
    assert.equal(responder('Allow access'), 'yes');
    assert.equal(responder('Continue?'), 'y');
    assert.equal(responder('Something else'), null);
  });

  it('handles invalid regex gracefully (falls back to substring)', () => {
    const responder = createAutoResponder([
      { prompt: '[invalid(regex', response: 'ok' },
    ]);
    // Should use substring match since regex is invalid
    assert.equal(responder('some [invalid(regex here'), 'ok');
  });
});
