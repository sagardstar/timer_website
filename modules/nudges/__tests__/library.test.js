import { MESSAGES } from '../library.js';

test('all categories have content', () => {
  ['breakStart','resume','streak','random'].forEach(k => {
    expect(Array.isArray(MESSAGES[k])).toBe(true);
    expect(MESSAGES[k].length).toBeGreaterThan(0);
  });
});

