import { Nudges } from '../index.js';
import { _resetSelectorState } from '../selector.js';

function makeUI() {
  const calls = [];
  return { calls, showMessage(text, type) { calls.push({ text, type, ts: Date.now() }); } };
}

beforeEach(() => _resetSelectorState());

test('work complete triggers streak + breakStart when autos off', () => {
  const ui = makeUI();
  const state = { streakCount: 2, startBreak: jest.fn(), enterBreakPaused: jest.fn() };
  const settings = { autoStartBreak: false };

  Nudges.onWorkComplete({ state, settings, ui, now: 0 });
  expect(ui.calls.some(c => c.type === 'streak')).toBe(true);
  expect(ui.calls.some(c => c.type === 'breakStart')).toBe(true);
});

test('resume after >= threshold shows resume message', () => {
  const ui = makeUI();
  Nudges.onResumeAfterPause({ pauseMinutes: 6, ui });
  expect(ui.calls.some(c => c.type === 'resume')).toBe(true);
});

test('random prompt scheduling returns handle', () => {
  const ui = makeUI();
  const settings = { wellnessPrompts: true };
  const handle = Nudges.scheduleRandomForWork({ settings, ui });
  expect(handle && typeof handle.id === 'number').toBe(true);
});

