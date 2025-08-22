export function createTimer({ onTick, onDone }) {
  let running = false,
    last = 0,
    remaining = 0,
    timeoutId = null;

  function start(ms) {
    remaining = ms;
    running = true;
    last = performance.now();
    tick();
  }

  function resume() {
    if (remaining <= 0) return;
    running = true;
    last = performance.now();
    tick();
  }

  function pause() {
    running = false;
    clearTimeout(timeoutId);
  }

  function reset(ms) {
    pause();
    remaining = ms;
    onTick?.(remaining);
  }

  function tick() {
    if (!running) return;
    const now = performance.now();
    const dt = now - last;
    last = now;
    remaining -= dt;
    if (remaining <= 0) {
      running = false;
      onTick?.(0);
      onDone?.();
      return;
    }
    onTick?.(remaining);
    timeoutId = setTimeout(tick, 100);
  }

  return { start, resume, pause, reset, getRemaining: () => remaining };
}

