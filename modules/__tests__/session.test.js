import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, restoreSession, updateSession, completionDateKey } from '../session.js';

test('restores a running session from its wall-clock deadline', () => {
  const record = createSession({ phase: 'work', status: 'running', durationMs: 25_000, now: 1_000, sessionId: 'one' });
  const restored = restoreSession(record, 6_000);
  assert.equal(restored.kind, 'active');
  assert.equal(restored.remainingMs, 20_000);
});

test('restores paused and ready phases exactly', () => {
  const paused = createSession({ phase: 'work', status: 'paused', durationMs: 25_000, remainingMs: 12_345, sessionId: 'two' });
  const ready = createSession({ phase: 'break', status: 'ready', durationMs: 5_000, sessionId: 'three' });
  assert.equal(restoreSession(paused, 999_999).remainingMs, 12_345);
  assert.equal(restoreSession(ready, 999_999).record.status, 'ready');
});

test('marks a passed running deadline as expired', () => {
  const record = createSession({ phase: 'break', status: 'running', durationMs: 5_000, now: 10_000, sessionId: 'four' });
  assert.equal(restoreSession(record, 15_001).kind, 'expired');
});

test('keeps the captured phase duration when future settings change', () => {
  const record = createSession({ phase: 'work', status: 'paused', durationMs: 30_000, remainingMs: 15_000, sessionId: 'five' });
  const resumed = updateSession(record, { status: 'running', remainingMs: 15_000 }, 20_000);
  assert.equal(resumed.phaseDurationMs, 30_000);
  assert.equal(resumed.endAt, 35_000);
});

test('attributes completion to the local date of the scheduled deadline', () => {
  const deadline = new Date(2026, 8, 14, 0, 0, 2).getTime();
  const record = createSession({ phase: 'work', status: 'running', durationMs: 5_000, now: deadline - 5_000, sessionId: 'six' });
  assert.equal(completionDateKey(record), '2026-09-14');
});

test('rejects corrupt session records', () => {
  assert.equal(restoreSession({ phase: 'work' }).kind, 'invalid');
});
