import test from 'node:test';
import assert from 'node:assert/strict';
import { Storage } from '../storage.js';

class MemoryStorage {
  constructor() { this.data = new Map(); this.failWrites = false; }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { if (this.failWrites) throw new Error('blocked'); this.data.set(key, String(value)); }
  removeItem(key) { if (this.failWrites) throw new Error('blocked'); this.data.delete(key); }
}

test('records the same completion ID only once across repeated recovery', async () => {
  globalThis.localStorage = new MemoryStorage();
  const first = await Storage.recordCompletion('2026-09-13', { id: 'session:work', kind: 'timer' });
  const second = await Storage.recordCompletion('2026-09-13', { id: 'session:work', kind: 'timer' });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.progress.done, 1);
});

test('offline undo removes only its stable completion ID and works once', async () => {
  globalThis.localStorage = new MemoryStorage();
  await Storage.recordCompletion('2026-09-13', { id: 'timer:work', kind: 'timer' });
  await Storage.recordCompletion('2026-09-13', { id: 'offline:one', kind: 'offline' });
  const first = await Storage.undoCompletion('2026-09-13', 'offline:one');
  const second = await Storage.undoCompletion('2026-09-13', 'offline:one');
  assert.equal(first.changed, true);
  assert.equal(first.progress.done, 1);
  assert.equal(first.progress.completions[0].id, 'timer:work');
  assert.equal(second.changed, false);
});

test('corrupt stored progress falls back without throwing', () => {
  globalThis.localStorage = new MemoryStorage();
  localStorage.setItem('tbw.progress.v1:2026-09-13', '{bad');
  assert.deepEqual(Storage.loadTodayProgress('2026-09-13'), { done: 0, streak: 0, completions: [] });
});

test('storage write failure does not prevent timer state calls', async () => {
  globalThis.localStorage = new MemoryStorage();
  localStorage.failWrites = true;
  assert.equal(Storage.saveActiveSession({ sessionId: 'x' }), false);
  const result = await Storage.recordCompletion('2026-09-13', { id: 'x:work', kind: 'timer' });
  assert.equal(result.failed, true);
});
