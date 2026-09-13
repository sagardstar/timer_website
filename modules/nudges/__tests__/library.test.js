import { MESSAGES } from '../library.js';
import test from 'node:test';
import assert from 'node:assert/strict';

test('all categories have content', () => {
  ['breakStart','resume','streak','random'].forEach(k => {
    assert.equal(Array.isArray(MESSAGES[k]), true);
    assert.ok(MESSAGES[k].length > 0);
  });
});
