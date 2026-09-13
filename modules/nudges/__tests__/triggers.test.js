import { Nudges } from '../index.js';
import { _resetSelectorState } from '../selector.js';
import test from 'node:test';
import assert from 'node:assert/strict';

function makeUI() {
  const calls = [];
  return { calls, showMessage(text, type) { calls.push({ text, type, ts: Date.now() }); } };
}

test('work complete enters break-ready and shows one calm message', () => {
  _resetSelectorState();
  const ui = makeUI();
  const calls = { start: 0, ready: 0 };
  const state = { streakCount: 2, startBreak: () => calls.start++, enterBreakPaused: () => calls.ready++ };
  const settings = { autoStartBreak: false };

  Nudges.onWorkComplete({ state, settings, ui, now: 0 });
  assert.equal(ui.calls.length, 1);
  assert.ok(['streak', 'breakStart'].includes(ui.calls[0].type));
  assert.equal(calls.ready, 1);
});

test('resume after >= threshold shows resume message', () => {
  _resetSelectorState();
  const ui = makeUI();
  Nudges.onResumeAfterPause({ pauseMinutes: 6, ui });
  assert.equal(ui.calls.some(c => c.type === 'resume'), true);
});

test('random prompt scheduling returns handle', () => {
  _resetSelectorState();
  const ui = makeUI();
  const settings = { wellnessPrompts: true };
  const handle = Nudges.scheduleRandomForWork({ settings, ui });
  assert.ok(handle && handle.id);
  clearTimeout(handle.id);
});
