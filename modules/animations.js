export function bindTeaLevel(teaEl) {
  return (elapsedMs, totalMs) => {
    const pct = Math.max(0, Math.min(1, elapsedMs / totalMs));
    teaEl.style.setProperty('--tea-level', String(pct));
  };
}

export function setBreakVisual(isBreak) {
  document.body.classList.toggle('break-active', !!isBreak);
}

export function setTimeOfDayVisual() {
  const h = new Date().getHours();
  const sun = document.querySelector('.sun');
  if (!sun) return;
  // Simple mapping: morning high, evening low
  const top = h < 12 ? 16 : h < 18 ? 30 : 50;
  sun.style.top = `${top}px`;
  sun.style.opacity = h >= 18 ? 0.6 : 0.9;
}

export function setSunsetMode(on) {
  const sky = document.querySelector('.sky');
  if (!sky) return;
  sky.style.background = on
    ? 'linear-gradient(#ffd7a0, #d0b2e8)'
    : 'linear-gradient(#cbe3ff, #e0fbfc)';
}

