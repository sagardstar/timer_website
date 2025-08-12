# Tea by the Window — Timer App: Master Build Document

This is the **single handoff file** for a coding LLM or developer.  
It includes: final requirements, milestone plan, **ALL source files (full code, no placeholders)**, tests, and deployment notes.

> Stack: Static site (HTML/CSS/vanilla JS modules). No backend. Host on GitHub Pages.  
> Defaults: **25m work / 5m break**, **auto-start break = ON**, **auto-start next work = ON**, **wellness prompts = OFF**.  
> Extras: **Log Session** (user can mark a session done even if they did it away from the app).

---

## 0) Final Requirements (condensed)

- Modes: `IDLE`, `WORK_RUNNING/PAUSED`, `BREAK_RUNNING/PAUSED`
- Controls: Start / Pause / Resume / Reset / Skip Break / Log Session
- Autos: Auto-start Break (ON by default), Auto-start Next Work (ON by default)
- Daily progress: done vs target (default 4), persisted per-day
- Messages: rotating, warm & playful; categories `breakStart`, `resume`, `streak`, `random`
- Message rules: cooldown 30s; no-repeat within last 3 of category; see trigger spec below
- Sounds: start clink, end chime; optional ambience (rain/café/birds)
- Accessibility: keyboard shortcuts, aria-live messages, high-contrast toggle
- Visuals: tea fills during work; steam during break; clouds drift; time-of-day palette
- Skip/Log Session: increases done + streak without running a work timer

---

## 1) Project Structure

Create this structure exactly (paths matter for imports in code below):

```
/public
  /assets/sounds/
  /assets/img/
index.html
styles.css
app.js
/modules/
  state.js
  timer.js
  storage.js
  audio.js
  animations.js
  settings.js
  ui/
    messages.js
    messages.css
  nudges/
    config.js
    library.js
    selector.js
    index.js
    types.d.ts
    __tests__/
      library.test.js
      selector.test.js
      triggers.test.js
```

---

## 2) Source Files (full code)

### 2.1 `index.html`
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tea by the Window</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="stylesheet" href="modules/ui/messages.css" />
</head>
<body>
  <header class="app-header">
    <h1>Tea by the Window</h1>
    <button id="openSettings" aria-haspopup="dialog" class="ghost">Settings</button>
  </header>

  <!-- Screen reader announcements -->
  <div id="aria-live" aria-live="polite" aria-atomic="true" class="sr-only"></div>

  <!-- Visual message layers -->
  <div id="msg-top-center" class="msg-layer" aria-hidden="true"></div>
  <div id="msg-bottom" class="msg-layer" aria-hidden="true"></div>

  <main class="grid">
    <section id="scene" aria-hidden="true">
      <div class="window">
        <div class="sky">
          <div class="cloud c1"></div>
          <div class="cloud c2"></div>
          <div class="cloud c3"></div>
          <div class="sun"></div>
          <div class="bird"></div>
        </div>
        <div class="sill"></div>
      </div>
      <div class="desk">
        <div class="mug">
          <div class="tea"></div>
          <div class="steam s1"></div>
          <div class="steam s2"></div>
          <div class="steam s3"></div>
        </div>
      </div>
    </section>

    <section id="hud">
      <div id="timer" role="timer" aria-live="polite" class="timer">25:00</div>

      <div id="controls" class="controls">
        <button id="startPauseBtn" class="primary">Start</button>
        <button id="resetBtn" class="ghost" aria-label="Reset session">Reset</button>
        <button id="skipBreakBtn" class="ghost" aria-label="Skip break">Skip Break</button>
        <button id="logSessionBtn" class="ghost" aria-label="Log a completed session">Log Session</button>
      </div>

      <div id="progress" class="progress" aria-live="polite">
        Today: <span id="doneCount">0</span>/<span id="targetCount">4</span>
      </div>
    </section>
  </main>

  <dialog id="settingsDialog" aria-label="Settings">
    <form method="dialog" id="settingsForm">
      <h2>Settings</h2>
      <label>
        Daily target
        <input type="number" id="setTarget" min="1" max="12" step="1" />
      </label>
      <label>
        <input type="checkbox" id="setAutoBreak" />
        Auto-start break
      </label>
      <label>
        <input type="checkbox" id="setAutoNext" />
        Auto-start next session
      </label>
      <label>
        <input type="checkbox" id="setWellness" />
        Wellness prompts during work
      </label>
      <label>
        Volume
        <input type="range" id="setVolume" min="0" max="1" step="0.05" />
      </label>
      <label>
        <input type="checkbox" id="setMuted" />
        Mute all sounds
      </label>
      <label>
        <input type="checkbox" id="setHighContrast" />
        High contrast mode
      </label>

      <menu>
        <button value="cancel" class="ghost">Cancel</button>
        <button id="saveSettingsBtn" value="default" class="primary">Save</button>
      </menu>
    </form>
  </dialog>

  <script type="module" src="app.js"></script>
</body>
</html>
```

---

### 2.2 `styles.css`
```css
:root {
  --bg: #fff8f0;
  --text: #3a2f2a;
  --accent: #d6a77a;
  --panel: #ffffff;
  --border: rgba(0,0,0,0.08);

  --timer-size: clamp(40px, 8vw, 88px);
  --tea-level: 0.0; /* 0..1 controlled by JS */
}

:root.high-contrast {
  --bg: #ffffff;
  --text: #111111;
  --panel: #ffffff;
  --border: #111;
}

* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  font: 16px/1.4 system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial, Noto Sans, 'Apple Color Emoji','Segoe UI Emoji';
  color: var(--text);
  background: var(--bg);
}

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

.app-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
  background: var(--panel);
}
.app-header h1 { margin: 0; font-size: 18px; }

.grid {
  display: grid;
  grid-template-columns: 1fr 420px;
  gap: 24px; padding: 24px;
}
@media (max-width: 920px) {
  .grid { grid-template-columns: 1fr; }
}

#scene {
  position: relative; min-height: 420px; border: 1px solid var(--border);
  border-radius: 12px; overflow: hidden; background: #f8ede3;
}

/* Window & sky */
.window { position: absolute; inset: 24px 24px auto 24px; height: 60%; border: 8px solid #e6d2bf; border-radius: 12px; background: #cbe3ff; }
.sky { position: relative; width: 100%; height: 100%; overflow: hidden; background: linear-gradient(#cbe3ff, #e0fbfc); }
.sun { position: absolute; width: 70px; height: 70px; right: 24px; top: 16px; border-radius: 50%; background: #ffd7a0; opacity: 0.9; }
.cloud { position: absolute; top: 20%; width: 160px; height: 60px; background: #fff; border-radius: 40px; filter: drop-shadow(0 6px 10px rgba(0,0,0,.08)); opacity: .9; }
.c1 { left: -180px; animation: drift 40s linear infinite; }
.c2 { top: 45%; left: -220px; width: 200px; animation: drift 55s linear infinite; }
.c3 { top: 65%; left: -160px; width: 140px; animation: drift 48s linear infinite; }
@keyframes drift { to { transform: translateX(140%); } }
.bird { position: absolute; top: 30%; left: -40px; width: 28px; height: 8px; background: transparent; border-radius: 50%; animation: bird 18s linear infinite; }
@keyframes bird { 0% { transform: translateX(0) } 100% { transform: translateX(1200px) } }
.sill { position: absolute; left: 16px; right: 16px; bottom: -10px; height: 20px; background: #d9c4b1; border-radius: 6px; }

/* Desk + mug */
.desk { position: absolute; left: 0; right: 0; bottom: 0; height: 38%; background: linear-gradient(#e6cba8, #d1b08a); }
.mug { position: absolute; left: 80px; bottom: 40px; width: 120px; height: 120px; background: #d6a77a; border-radius: 10px; transform: rotate(0.5deg); box-shadow: inset 0 0 0 8px rgba(0,0,0,0.06); }
.mug::after { content: ""; position: absolute; right: -26px; top: 36px; width: 50px; height: 36px; border: 8px solid #d6a77a; border-left-color: transparent; border-radius: 50%; }
.tea { position: absolute; left: 8px; right: 8px; bottom: 8px; height: calc( var(--tea-level) * (100% - 16px) ); background: #9b6b42; border-radius: 6px; transition: height .2s linear; }

.steam { position: absolute; left: 36px; top: -20px; width: 26px; height: 26px; border-radius: 50%; background: rgba(255,255,255,0.6); filter: blur(2px); opacity: 0; }
.s1 { animation: steam 5s ease-in-out infinite; }
.s2 { left: 60px; animation: steam 6s ease-in-out infinite 1s; }
.s3 { left: 20px; animation: steam 7s ease-in-out infinite 2s; }
@keyframes steam {
  0% { transform: translateY(0) scale(0.8); opacity: 0; }
  10% { opacity: .7; }
  100% { transform: translateY(-40px) scale(1.2); opacity: 0; }
}
.break-active .steam { opacity: 1; }

/* HUD */
#hud { display: grid; gap: 16px; align-content: start; }
.timer { font-size: var(--timer-size); font-weight: 800; letter-spacing: 1px; text-align: center; }

.controls { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
button { border-radius: 10px; padding: 10px 14px; border: 1px solid var(--border); background: var(--panel); color: var(--text); cursor: pointer; }
button.primary { background: #2b7a78; color: white; border-color: #2b7a78; }
button.ghost { background: transparent; }
button:disabled { opacity: .6; cursor: not-allowed; }

.progress { text-align: center; padding: 8px 0; border-top: 1px dashed var(--border); }

/* Dialog */
dialog { border: 1px solid var(--border); border-radius: 12px; padding: 16px; width: min(90vw, 420px); }
dialog form { display: grid; gap: 12px; }
dialog menu { display: flex; gap: 8px; justify-content: flex-end; }

/* Message layers */
.msg-layer { position: fixed; left: 0; right: 0; pointer-events: none; z-index: 9999; display: flex; justify-content: center; gap: 8px; padding: 12px; }
#msg-top-center { top: 12px; }
#msg-bottom { bottom: 12px; }
```

---

### 2.3 `app.js`
```js
import { AppState } from './modules/state.js';
import { createTimer } from './modules/timer.js';
import { Storage } from './modules/storage.js';
import { createAudio } from './modules/audio.js';
import { Nudges } from './modules/nudges/index.js';
import { createUIAdapter } from './modules/ui/messages.js';
import { bindTeaLevel, setBreakVisual, setTimeOfDayVisual, setSunsetMode } from './modules/animations.js';

// ---------- DOM refs
const timerEl = document.getElementById('timer');
const startPauseBtn = document.getElementById('startPauseBtn');
const resetBtn = document.getElementById('resetBtn');
const skipBreakBtn = document.getElementById('skipBreakBtn');
const logSessionBtn = document.getElementById('logSessionBtn');
const doneCountEl = document.getElementById('doneCount');
const targetCountEl = document.getElementById('targetCount');
const openSettingsBtn = document.getElementById('openSettings');
const settingsDialog = document.getElementById('settingsDialog');
const settingsForm = document.getElementById('settingsForm');

// ---------- UI adapter
const ui = createUIAdapter();

// ---------- State & settings
const todayKey = Storage.todayKey();
const savedSettings = Storage.loadSettings();
const savedProgress = Storage.loadTodayProgress(todayKey);

const state = new AppState({
  workDurationMs: 25 * 60 * 1000,
  breakDurationMs: 5 * 60 * 1000,
  remainingMs: 25 * 60 * 1000,
  doneToday: savedProgress.done,
  targetToday: savedSettings.targetToday ?? 4,
  autoStartBreak: savedSettings.autoStartBreak ?? true,
  autoStartNextWork: savedSettings.autoStartNextWork ?? true,
  streakCount: savedProgress.streak
});

// ---------- Audio
const audio = createAudio({ volume: savedSettings.volume ?? 0.5, muted: savedSettings.muted ?? false });
// NOTE: provide your own asset files in /public/assets/sounds/
audio.load('startClink', './public/assets/sounds/start_clink.mp3');
audio.load('endChime', './public/assets/sounds/end_chime.mp3');

// ---------- Animations binding
const teaLevelBinder = bindTeaLevel(document.querySelector('.tea'));

// ---------- Timer
let lastWhole = null;
const timer = createTimer({
  onTick: (ms) => {
    // render number once per second
    const sec = Math.ceil(ms / 1000);
    if (sec !== lastWhole) {
      timerEl.textContent = formatMMSS(sec);
      lastWhole = sec;
    }
    if (state.mode === 'WORK_RUNNING') {
      teaLevelBinder(state.workDurationMs - ms, state.workDurationMs);
    }
  },
  onDone: () => {
    if (state.mode === 'WORK_RUNNING') {
      onWorkComplete();
    } else if (state.mode === 'BREAK_RUNNING') {
      onBreakComplete();
    }
  }
});

function formatMMSS(totalSec) {
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ---------- Initial render
targetCountEl.textContent = String(state.targetToday);
updateProgress();
updateButtons();
setTimeOfDayVisual();
timerEl.textContent = formatMMSS(Math.ceil(state.remainingMs/1000));

// ---------- Button wiring
startPauseBtn.addEventListener('click', () => {
  if (state.mode === 'IDLE') {
    startWork();
  } else if (state.mode === 'WORK_RUNNING' || state.mode === 'BREAK_RUNNING') {
    pauseTimer();
  } else if (state.mode === 'WORK_PAUSED' || state.mode === 'BREAK_PAUSED') {
    resumeTimer();
  }
});

resetBtn.addEventListener('click', () => {
  resetToIdle();
});

skipBreakBtn.addEventListener('click', () => {
  if (state.mode === 'BREAK_RUNNING' || state.mode === 'BREAK_PAUSED') {
    if (state.autoStartNextWork) {
      startWork();
    } else {
      resetToIdle();
    }
  }
});

logSessionBtn.addEventListener('click', () => {
  // Recommended: disable while timer running to avoid confusion
  if (state.mode === 'WORK_RUNNING' || state.mode === 'BREAK_RUNNING' || state.mode === 'WORK_PAUSED' || state.mode === 'BREAK_PAUSED') return;
  state.doneToday += 1;
  state.streakCount += 1;
  Storage.saveTodayProgress(todayKey, { done: state.doneToday, streak: state.streakCount });
  updateProgress();
  Nudges.onLogSession({ state, ui });
  checkDayGoal();
});

openSettingsBtn.addEventListener('click', () => {
  openSettings();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === ' ') { e.preventDefault(); startPauseBtn.click(); }
  if (e.key === 'r' || e.key === 'R') resetBtn.click();
  if (e.key === 's' || e.key === 'S') skipBreakBtn.click();
  if (e.key === 'l' || e.key === 'L') logSessionBtn.click();
});

// ---------- State transitions
let pauseStartedAt = 0;
let randomPromptHandle = null;

function startWork() {
  // Audio requires user gesture; safe to play here
  audio.play('startClink');
  state.mode = 'WORK_RUNNING';
  state.remainingMs = state.workDurationMs;
  lastWhole = null;
  setBreakVisual(false);
  timer.start(state.remainingMs);
  startPauseBtn.textContent = 'Pause';
  updateButtons();
  if (randomPromptHandle?.id) clearTimeout(randomPromptHandle.id);
  randomPromptHandle = Nudges.scheduleRandomForWork({
    settings: { wellnessPrompts: Storage.loadSettings().wellnessPrompts ?? false },
    ui
  });
}

function pauseTimer() {
  if (state.mode === 'WORK_RUNNING' || state.mode === 'BREAK_RUNNING') {
    timer.pause();
    state.remainingMs = timer.getRemaining();
    state.mode = state.mode === 'WORK_RUNNING' ? 'WORK_PAUSED' : 'BREAK_PAUSED';
    pauseStartedAt = Date.now();
    startPauseBtn.textContent = 'Resume';
    updateButtons();
  }
}

function resumeTimer() {
  const pausedMs = Date.now() - pauseStartedAt;
  const pauseMinutes = Math.floor(pausedMs / 60000);
  Nudges.onResumeAfterPause({ pauseMinutes, ui });

  if (state.mode === 'WORK_PAUSED' || state.mode === 'BREAK_PAUSED') {
    timer.resume();
    state.mode = state.mode === 'WORK_PAUSED' ? 'WORK_RUNNING' : 'BREAK_RUNNING';
    startPauseBtn.textContent = 'Pause';
    updateButtons();
  }
}

function resetToIdle() {
  timer.reset(state.workDurationMs);
  state.mode = 'IDLE';
  state.remainingMs = state.workDurationMs;
  lastWhole = null;
  timerEl.textContent = formatMMSS(Math.ceil(state.remainingMs/1000));
  teaLevelBinder(0, state.workDurationMs);
  setBreakVisual(false);
  startPauseBtn.textContent = 'Start';
  updateButtons();
}

function onWorkComplete() {
  audio.play('endChime');
  state.doneToday += 1;
  state.streakCount += 1;
  Storage.saveTodayProgress(todayKey, { done: state.doneToday, streak: state.streakCount });
  updateProgress();
  Nudges.onWorkComplete({
    state: {
      streakCount: state.streakCount,
      startBreak: startBreak,
      enterBreakPaused: enterBreakPaused
    },
    settings: {
      autoStartBreak: state.autoStartBreak
    },
    ui
  });
  checkDayGoal();
}

function startBreak() {
  state.mode = 'BREAK_RUNNING';
  state.remainingMs = state.breakDurationMs;
  lastWhole = null;
  setBreakVisual(true);
  timer.start(state.remainingMs);
  startPauseBtn.textContent = 'Pause';
  updateButtons();
}

function enterBreakPaused() {
  state.mode = 'BREAK_PAUSED';
  state.remainingMs = state.breakDurationMs;
  lastWhole = null;
  setBreakVisual(true);
  timer.reset(state.remainingMs);
  startPauseBtn.textContent = 'Resume';
  updateButtons();
}

function onBreakComplete() {
  if (state.autoStartNextWork) {
    startWork();
  } else {
    resetToIdle();
  }
}

function updateProgress() {
  doneCountEl.textContent = String(state.doneToday);
  targetCountEl.textContent = String(state.targetToday);
}

function checkDayGoal() {
  if (state.doneToday >= state.targetToday) {
    setSunsetMode(true);
    Nudges.onDayGoalReached({ ui });
  } else {
    setSunsetMode(false);
  }
}

function updateButtons() {
  const inBreak = state.mode.startsWith('BREAK');
  document.body.classList.toggle('break-active', inBreak);
  skipBreakBtn.disabled = !inBreak;
  // Log Session disabled unless IDLE
  logSessionBtn.disabled = state.mode !== 'IDLE';
}

// ---------- Settings
function openSettings() {
  // populate current values
  const s = Storage.loadSettings();
  settingsForm.querySelector('#setTarget').value = String(s.targetToday ?? state.targetToday);
  settingsForm.querySelector('#setAutoBreak').checked = s.autoStartBreak ?? state.autoStartBreak;
  settingsForm.querySelector('#setAutoNext').checked = s.autoStartNextWork ?? state.autoStartNextWork;
  settingsForm.querySelector('#setWellness').checked = s.wellnessPrompts ?? false;
  settingsForm.querySelector('#setVolume').value = String(s.volume ?? 0.5);
  settingsForm.querySelector('#setMuted').checked = s.muted ?? false;
  settingsForm.querySelector('#setHighContrast').checked = document.documentElement.classList.contains('high-contrast');

  settingsDialog.showModal();
}

settingsForm.addEventListener('close', () => {
  // no-op
});

document.getElementById('saveSettingsBtn').addEventListener('click', (e) => {
  e.preventDefault();
  const next = {
    targetToday: clampInt(settingsForm.querySelector('#setTarget').value, 1, 12, 4),
    autoStartBreak: !!settingsForm.querySelector('#setAutoBreak').checked,
    autoStartNextWork: !!settingsForm.querySelector('#setAutoNext').checked,
    wellnessPrompts: !!settingsForm.querySelector('#setWellness').checked,
    volume: parseFloat(settingsForm.querySelector('#setVolume').value || '0.5'),
    muted: !!settingsForm.querySelector('#setMuted').checked
  };
  Storage.saveSettings(next);
  // apply
  state.targetToday = next.targetToday;
  state.autoStartBreak = next.autoStartBreak;
  state.autoStartNextWork = next.autoStartNextWork;
  audio.setVolume(next.volume);
  audio.setMuted(next.muted);
  document.documentElement.classList.toggle('high-contrast', !!settingsForm.querySelector('#setHighContrast').checked);
  updateProgress();
  settingsDialog.close();
});

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}
```

---

### 2.4 `modules/state.js`
```js
export class AppState {
  constructor(init = {}) {
    this.mode = init.mode ?? 'IDLE';
    this.workDurationMs = init.workDurationMs ?? 25 * 60 * 1000;
    this.breakDurationMs = init.breakDurationMs ?? 5 * 60 * 1000;
    this.remainingMs = init.remainingMs ?? this.workDurationMs;
    this.doneToday = init.doneToday ?? 0;
    this.targetToday = init.targetToday ?? 4;
    this.autoStartBreak = init.autoStartBreak ?? true;
    this.autoStartNextWork = init.autoStartNextWork ?? true;
    this.streakCount = init.streakCount ?? 0;
  }
}
```

---

### 2.5 `modules/timer.js`
```js
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
```

---

### 2.6 `modules/storage.js`
```js
const SETTINGS_KEY = 'tbw.settings.v1';

function progressKey(dateKey) {
  return `tbw.progress.v1:${dateKey}`;
}

export const Storage = {
  todayKey() {
    // YYYY-MM-DD local
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  },

  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return {
        targetToday: 4,
        autoStartBreak: true,
        autoStartNextWork: true,
        wellnessPrompts: false,
        volume: 0.5,
        muted: false
      };
      const parsed = JSON.parse(raw);
      return {
        targetToday: parsed.targetToday ?? 4,
        autoStartBreak: parsed.autoStartBreak ?? true,
        autoStartNextWork: parsed.autoStartNextWork ?? true,
        wellnessPrompts: parsed.wellnessPrompts ?? false,
        volume: parsed.volume ?? 0.5,
        muted: parsed.muted ?? false
      };
    } catch {
      return { targetToday: 4, autoStartBreak: true, autoStartNextWork: true, wellnessPrompts: false, volume: 0.5, muted: false };
    }
  },

  saveSettings(s) {
    const next = {
      targetToday: s.targetToday ?? 4,
      autoStartBreak: !!s.autoStartBreak,
      autoStartNextWork: !!s.autoStartNextWork,
      wellnessPrompts: !!s.wellnessPrompts,
      volume: typeof s.volume === 'number' ? s.volume : 0.5,
      muted: !!s.muted
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  },

  loadTodayProgress(dateKey) {
    try {
      const raw = localStorage.getItem(progressKey(dateKey));
      if (!raw) return { done: 0, streak: 0 };
      const parsed = JSON.parse(raw);
      return {
        done: parsed.done ?? 0,
        streak: parsed.streak ?? 0
      };
    } catch {
      return { done: 0, streak: 0 };
    }
  },

  saveTodayProgress(dateKey, data) {
    const next = {
      done: data.done ?? 0,
      streak: data.streak ?? 0
    };
    localStorage.setItem(progressKey(dateKey), JSON.stringify(next));
  }
};
```

---

### 2.7 `modules/audio.js`
```js
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
```

---

### 2.8 `modules/animations.js`
```js
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
```

---

### 2.9 `modules/ui/messages.css`
```css
/* Visual message component styles (toasts/banners) */

.msg-layer {
  position: fixed; left: 0; right: 0; pointer-events: none; z-index: 9999;
  display: flex; justify-content: center; gap: 8px; padding: 12px;
}
#msg-top-center { top: 12px; }
#msg-bottom { bottom: 12px; }

.msg {
  pointer-events: auto;
  max-width: 640px; padding: 10px 14px; border-radius: 10px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.12);
  background: #fff8f0; color: #3a2f2a; font: 500 14px/1.35 system-ui, sans-serif;
  border: 1px solid rgba(0,0,0,0.06); opacity: 0; transform: translateY(-8px);
  transition: opacity .3s ease, transform .3s ease;
}
.msg.show { opacity: 1; transform: translateY(0); }

.msg--break  { background: #fff3e0; border-color: #f3d4b1; }
.msg--resume { background: #eef6ff; border-color: #cfe3ff; }
.msg--streak { background: #f0fff2; border-color: #cdeccf; }
.msg--info   { background: #fff9fb; border-color: #f1d4e5; }

/* Simple sparkle for streaks */
.msg--streak::after {
  content: ""; display: inline-block; margin-left: 6px; width: 10px; height: 10px;
  background: radial-gradient(circle, rgba(0,0,0,.12) 20%, transparent 21%) center/6px 6px repeat;
  border-radius: 50%;
  animation: sparkle 1.4s ease-out 1;
}
@keyframes sparkle {
  0% { transform: scale(.6); opacity: .0; }
  40% { opacity: .8; }
  100% { transform: scale(1.2); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .msg { transition: none; }
  .msg--streak::after { animation: none; }
}

:root.high-contrast .msg { color: #111; background: #fff; border-color: #111; }
```

---

### 2.10 `modules/ui/messages.js`
```js
const DURATIONS = {
  breakStart: 4000,
  resume: 3000,
  streak: 4500,
  random: 3500
};

function mount(container, text, className, ms) {
  const el = document.createElement('div');
  el.className = `msg ${className}`;
  el.textContent = text;
  container.appendChild(el);

  // announce for screen readers
  const live = document.getElementById('aria-live');
  if (live) {
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 10);
  }

  requestAnimationFrame(() => el.classList.add('show'));

  const timeout = setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, ms);

  el.addEventListener('mouseenter', () => clearTimeout(timeout), { once: true });
}

export function createUIAdapter() {
  const top = document.getElementById('msg-top-center');
  const bottom = document.getElementById('msg-bottom');

  function showMessage(text, type) {
    switch (type) {
      case 'breakStart':
        mount(top, text, 'msg--break', DURATIONS.breakStart);
        break;
      case 'resume':
        mount(top, text, 'msg--resume', DURATIONS.resume);
        break;
      case 'streak':
        mount(bottom, text, 'msg--streak', DURATIONS.streak);
        break;
      case 'random':
      default:
        mount(bottom, text, 'msg--info', DURATIONS.random);
        break;
    }
  }

  return { showMessage };
}
```

---

### 2.11 `modules/nudges/config.js`
```js
export const NUDGE_CONFIG = {
  RESUME_THRESHOLD_MIN: 5,          // paused ≥ 5 min → resume nudge
  STREAK_INTERVAL: 2,               // every 2 sessions → streak nudge
  RANDOM_ENABLED_DEFAULT: false,
  RANDOM_WITHIN_MIN_RANGE: [8, 18], // one random minute during work
  MESSAGE_COOLDOWN_MS: 30_000,
  NO_REPEAT_WINDOW: 3
};
```

---

### 2.12 `modules/nudges/library.js`
```js
export const MESSAGES = {
  breakStart: [
    "Stretch your arms like you’ve just woken up.",
    "Sip something warm (or cold) and relax.",
    "Close your eyes… just for a few breaths.",
    "Let your shoulders drop — they’ve been working too.",
    "Look outside, notice something you haven’t before.",
    "Move your neck gently side to side.",
    "Wiggle your toes and wake up your feet.",
    "Step away from the screen for a mini-adventure.",
    "Take a slow inhale, exhale even slower.",
    "Pour yourself a little kindness — you deserve it."
  ],
  resume: [
    "Let’s pick up where we left off — steady and calm.",
    "We were in a nice rhythm… shall we get back to it?",
    "Your tea’s still warm — let’s keep going.",
    "No rush — just one small step forward now.",
    "The day’s still here for you — ready?",
    "Let’s ease back into it, nice and light.",
    "Where were we? Oh yes — moving ahead.",
    "A little progress is still progress.",
    "We can make this next bit cozy.",
    "Your corner of the world is waiting."
  ],
  streak: [
    "That’s two in a row — you’re on a gentle roll.",
    "Look at that streak — quiet focus is magic.",
    "Another chapter in your day, done beautifully.",
    "The view from here is looking good.",
    "Small steps, steady pace — this works.",
    "That’s momentum you can feel.",
    "Like a cup refilling — you’re recharging too.",
    "Your focus muscles are getting stronger.",
    "That’s a lovely little streak you’ve got there.",
    "Your tea break will taste even better now."
  ],
  random: [
    "Loosen your hands and shake them out.",
    "Adjust your chair and find comfort again.",
    "Take a micro-walk — even five steps count.",
    "Hum a tune you like.",
    "Smile at something nearby.",
    "Rest your eyes — they’ve earned it.",
    "Take three breaths you can actually notice.",
    "Imagine your favorite place for a moment.",
    "Tap your fingers to a rhythm you enjoy.",
    "Stretch your legs and feel the floor beneath you."
  ]
};
```

---

### 2.13 `modules/nudges/selector.js`
```js
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
```

---

### 2.14 `modules/nudges/index.js`
```js
import { NUDGE_CONFIG } from './config.js';
import { pickMessage, canShowMessage, markMessageShown, scheduleRandomWorkPrompt } from './selector.js';

export const Nudges = {
  NUDGE_CONFIG,

  show(type, ui) {
    if (!canShowMessage()) return;
    const text = pickMessage(type);
    if (!text) return;
    ui.showMessage(text, type);
    markMessageShown();
  },

  onWorkComplete({ state, settings, ui, now = Date.now() }) {
    if (state.streakCount % NUDGE_CONFIG.STREAK_INTERVAL === 0 && canShowMessage(now)) {
      this.show('streak', ui);
    }
    if (settings.autoStartBreak) {
      state.startBreak();
      setTimeout(() => this.show('breakStart', ui), 1000);
    } else {
      state.enterBreakPaused();
      this.show('breakStart', ui);
    }
  },

  onBreakStart({ ui }) {
    this.show('breakStart', ui);
  },

  onResumeAfterPause({ pauseMinutes, ui }) {
    if (pauseMinutes >= NUDGE_CONFIG.RESUME_THRESHOLD_MIN) {
      this.show('resume', ui);
    }
  },

  scheduleRandomForWork({ settings, ui }) {
    if (!settings.wellnessPrompts) return null;
    return scheduleRandomWorkPrompt({
      enabled: true,
      range: NUDGE_CONFIG.RANDOM_WITHIN_MIN_RANGE,
      onFire: () => this.show('random', ui),
      nowMs: Date.now()
    });
  },

  onLogSession({ state, ui, now = Date.now() }) {
    if (state.streakCount % NUDGE_CONFIG.STREAK_INTERVAL === 0 && canShowMessage(now)) {
      this.show('streak', ui);
    }
  },

  onDayGoalReached({ ui }) {
    if (canShowMessage()) {
      ui.showMessage("That’s a wrap for today — enjoy your evening.", 'streak');
      markMessageShown();
    }
  }
};
```

---

### 2.15 `modules/nudges/types.d.ts`
```ts
export type NudgeType = 'breakStart' | 'resume' | 'streak' | 'random';

export interface UIAdapter {
  showMessage(text: string, type: NudgeType): void;
}

export interface Settings {
  wellnessPrompts: boolean;
  autoStartBreak: boolean;
  autoStartNextWork: boolean;
  volume?: number;
  muted?: boolean;
}

export interface State {
  streakCount: number;
  startBreak: () => void;
  enterBreakPaused: () => void;
}

export interface RandomScheduleHandle {
  id: number;
  fireAt: number;
}
```

---

### 2.16 `modules/settings.js` (utility kept minimal, dialog content is in `index.html`)
```js
// (Optional helper if you want to factor out dialog logic. Currently handled in app.js.)
```

---

### 2.17 Tests — `modules/nudges/__tests__/library.test.js`
```js
import { MESSAGES } from '../library.js';

test('all categories have content', () => {
  ['breakStart','resume','streak','random'].forEach(k => {
    expect(Array.isArray(MESSAGES[k])).toBe(true);
    expect(MESSAGES[k].length).toBeGreaterThan(0);
  });
});
```

### 2.18 Tests — `modules/nudges/__tests__/selector.test.js`
```js
import { pickMessage, canShowMessage, markMessageShown, _resetSelectorState } from '../selector.js';
import { NUDGE_CONFIG } from '../config.js';

beforeEach(() => _resetSelectorState());

test('respects cooldown', () => {
  expect(canShowMessage(0)).toBe(true);
  markMessageShown(0);
  expect(canShowMessage(1)).toBe(false);
  const t = NUDGE_CONFIG.MESSAGE_COOLDOWN_MS + 1;
  expect(canShowMessage(t)).toBe(true);
});

test('avoids repeating last N when possible', () => {
  const seen = new Set();
  for (let i=0; i<6; i++) {
    const m = pickMessage('breakStart');
    expect(m).toBeTruthy();
    seen.add(m);
  }
  expect(seen.size).toBeGreaterThan(1);
});
```

### 2.19 Tests — `modules/nudges/__tests__/triggers.test.js`
```js
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
```

> Notes: If using Jest timers, add `jest.useFakeTimers()` and `jest.advanceTimersByTime(ms)` where needed.

---

## 3) Message Trigger Rules (authoritative)

- **On Work Complete**
  - done++ ; streak++ ; end-chime
  - If `streak % 2 == 0` and cooldown ok → show `streak`
  - If `autoStartBreak` → start break; then after 1s show `breakStart` (respect cooldown); else enter `BREAK_PAUSED` and show `breakStart` immediately (respect cooldown)
- **On Break Start** → show `breakStart` (respect cooldown)
- **On Resume after Pause (≥5 min)** → show `resume` (respect cooldown)
- **During Work (optional)**: if `wellnessPrompts` → schedule one `random` prompt at a uniformly random minute in `[8,18]`; show if still working and cooldown ok
- **On Log Session** (manual skip) → done++ ; streak++ ; if `streak % 2 == 0` → show `streak` (respect cooldown)
- **On Daily Target Reached** → sunset scene + final toast: “That’s a wrap for today — enjoy your evening.”

Cooldown: minimum 30 seconds between any two messages.  
No-repeat: avoid repeating the last 3 used messages within a category when possible.

---

## 4) Manual Test Plan (high level)

1. **Happy path** (autos ON): Start → work ends → break auto-starts → break ends → next work auto-starts.  
2. **Autos OFF**: Start → work ends → enters `BREAK_PAUSED` with breakStart message; user manually starts break; break ends → `IDLE`.  
3. **Pause & resume**: Pause >5 min (temporarily reduce threshold to test) → resume shows `resume`.  
4. **Skip Break**: During break, Skip → next work starts (or IDLE if auto-next OFF).  
5. **Log Session**: From IDLE, log session → increments done/streak; potential `streak` nudge.  
6. **Goal reached**: Set target=2; finish/log 2 → sunset + final toast.  
7. **Persistence**: Reload → settings + today’s progress persist. New day key resets.  
8. **Accessibility**: Keyboard shortcuts; aria-live announces; high-contrast legible.

---

## 5) Deployment Notes

- Place assets under `/public` and use relative paths (the code references `./public/...`).  
- For GitHub Pages, keep everything in repo root (or adjust paths if you use `/docs` folder).  
- Sounds will only play after first user gesture due to browser policies (we attach to Start click).  
- Optional: add a simple service worker for offline caching later.

---

## 6) License / Attribution

- You will need to supply your own audio files. Use CC0/royalty-free chimes/clinks or generate originals.  
- All code here is provided as boilerplate—adjust as needed.

---

**End of master document.**
