import { pickMessage, canShowMessage, markMessageShown, _resetSelectorState } from '../selector.js';
import { NUDGE_CONFIG } from '../config.js';

beforeEach(() => _resetSelectorState());

test('respects cooldown', () => {
  expect(canShowMessage(0)).toBe(true);
  markMessageShown(0);
  expect(canShowMessage(1)).toBe(false);
  const t = NUDGE_CONFIG.MESSAGE_COOLDOWN_MS + 1;
  expect(canShowMessage(t)).toBe(true);
});

test('avoids repeating last N when possible', () => {
  const seen = new Set();
  for (let i=0; i<6; i++) {
    const m = pickMessage('breakStart');
    expect(m).toBeTruthy();
    seen.add(m);
  }
  expect(seen.size).toBeGreaterThan(1);
});

