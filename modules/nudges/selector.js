import { MESSAGES } from './library.js';
import { NUDGE_CONFIG } from './config.js';

const lastIdx = { breakStart: [], resume: [], streak: [], random: [] };
let lastShownAt = 0;

export function canShowMessage(now = Date.now()) {
  return now - lastShownAt >= NUDGE_CONFIG.MESSAGE_COOLDOWN_MS;
}
export function markMessageShown(now = Date.now()) { lastShownAt = now; }

export function pickMessage(type) {
  const set = MESSAGES[type];
  if (!set || set.length === 0) return null;

  const window = NUDGE_CONFIG.NO_REPEAT_WINDOW;
  let idx, guard = 0;
  do {
    idx = Math.floor(Math.random() * set.length);
    guard++;
  } while (set.length > window && lastIdx[type].includes(idx) && guard < 25);

  lastIdx[type].push(idx);
  if (lastIdx[type].length > window) lastIdx[type].shift();
  return set[idx];
}

export function scheduleRandomWorkPrompt({ enabled, range, onFire, nowMs = 0 }) {
  if (!enabled) return null;
  const [a, b] = range;
  const minute = a + Math.floor(Math.random() * (b - a + 1));
  const delay = minute * 60 * 1000;
  const id = setTimeout(() => onFire(), delay);
  return { id, fireAt: nowMs + delay };
}

// for tests
export function _resetSelectorState() {
  lastIdx.breakStart = []; lastIdx.resume = []; lastIdx.streak = []; lastIdx.random = [];
  lastShownAt = 0;
}

