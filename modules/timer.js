export function createTimer({ onTick, onDone }) {
  let running = false, last = 0, remaining = 0, rafId = null;

  function start(ms) {
    remaining = ms;
    running = true; last = performance.now();
    tick();
  }
  function resume() {
    if (remaining <= 0) return;
    running = true; last = performance.now();
    tick();
  }
  function pause() { running = false; cancelAnimationFrame(rafId); }
  function reset(ms) { pause(); remaining = ms; onTick?.(remaining); }

  function tick() {
    if (!running) return;
    const now = performance.now();
    const dt = now - last; last = now;
    remaining -= dt;
    if (remaining <= 0) {
      running = false;
      onTick?.(0);
      onDone?.();
      return;
    }
    onTick?.(remaining);
    rafId = requestAnimationFrame(tick);
  }

  return { start, resume, pause, reset, getRemaining: () => remaining };
}

