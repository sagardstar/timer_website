import { pickMessage, canShowMessage, markMessageShown, _resetSelectorState } from '../selector.js';
import { NUDGE_CONFIG } from '../config.js';
import test from 'node:test';
import assert from 'node:assert/strict';

test('respects cooldown', () => {
  _resetSelectorState();
  assert.equal(canShowMessage(0), true);
  markMessageShown(0);
  assert.equal(canShowMessage(1), false);
  const t = NUDGE_CONFIG.MESSAGE_COOLDOWN_MS + 1;
  assert.equal(canShowMessage(t), true);
});

test('avoids repeating last N when possible', () => {
  _resetSelectorState();
  const seen = new Set();
  for (let i=0; i<6; i++) {
    const m = pickMessage('breakStart');
    assert.ok(m);
    seen.add(m);
  }
  assert.ok(seen.size > 1);
});
