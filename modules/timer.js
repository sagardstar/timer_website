export function createTimer({ onTick, onDone }) {
  let running = false;
  let remaining = 0;
  let endAt = 0; // performance.now() timestamp when timer should end
  let tickId = null;
  let doneId = null;

  const TICK_MS = 500; // UI updates; remaining is time-based so throttling is OK

  function clearSchedules() {
    if (tickId) { clearInterval(tickId); tickId = null; }
    if (doneId) { clearTimeout(doneId); doneId = null; }
  }

  function schedule() {
    clearSchedules();
    // Immediate tick to update UI right away
    tick();
    // Regular ticks for UI updates
    tickId = setInterval(tick, TICK_MS);
    // Dedicated timeout to fire completion as close to real time as possible
    const delay = Math.max(0, endAt - performance.now());
    doneId = setTimeout(fireDone, delay);
  }

  function start(ms) {
    remaining = ms;
    endAt = performance.now() + ms;
    running = true;
    schedule();
  }

  function resume() {
    if (remaining <= 0) return;
    endAt = performance.now() + remaining;
    running = true;
    schedule();
  }

  function pause() {
    if (!running) return;
    running = false;
    // compute up-to-date remaining and stop scheduling
    remaining = Math.max(0, endAt - performance.now());
    clearSchedules();
    onTick?.(remaining);
  }

  function reset(ms) {
    running = false;
    clearSchedules();
    remaining = ms;
    endAt = 0;
    onTick?.(remaining);
  }

  function tick() {
    if (!running) return;
    remaining = Math.max(0, endAt - performance.now());
    onTick?.(remaining);
    if (remaining <= 0) {
      fireDone();
    }
  }

  function fireDone() {
    if (!running) return;
    running = false;
    clearSchedules();
    remaining = 0;
    onTick?.(0);
    onDone?.();
  }

  return { start, resume, pause, reset, getRemaining: () => remaining };
}
