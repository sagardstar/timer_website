export function createAudio({ volume = 0.5, muted = false } = {}) {
  const sounds = new Map();
  function load(name, url) {
    const a = new Audio(url);
    a.preload = 'auto';
    sounds.set(name, a);
  }
  function play(name) {
    if (muted) return;
    const a = sounds.get(name);
    if (!a) return;
    try {
      a.volume = volume;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }
  function setMuted(m) { muted = !!m; }
  function setVolume(v) {
    if (typeof v === 'number') volume = Math.min(1, Math.max(0, v));
  }
  return { load, play, setMuted, setVolume };
}

