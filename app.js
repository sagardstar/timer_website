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
const skipSessionBtn = document.getElementById('skipSessionBtn');
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
// Load available end sounds
audio.load('bell', './public/assets/sounds/bell.mp3');
audio.load('bird', './public/assets/sounds/bird-sound.mp3');
// Lightweight start cue mapped to bell for now
audio.load('startClink', './public/assets/sounds/bell.mp3');

// Selected end sounds (defaults to bell for both)
let workEndSound = savedSettings.workEndSound ?? 'bell';
let breakEndSound = savedSettings.breakEndSound ?? 'bell';

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
      updateTabUI();
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
updateTabUI();

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

skipSessionBtn.addEventListener('click', () => {
  // Skip current or next work session and move to break without counting as done
  if (state.mode.startsWith('BREAK')) return; // no-op during break
  // Stop any running timer
  timer.pause();
  // Enter break (auto or paused)
  if (state.autoStartBreak) {
    startBreak();
    setTimeout(() => Nudges.onBreakStart({ ui }), 200);
  } else {
    enterBreakPaused();
    Nudges.onBreakStart({ ui });
  }
});

// Log session → count as done and move to break
if (logSessionBtn) {
  logSessionBtn.addEventListener('click', () => {
    if (state.mode.startsWith('BREAK')) return; // ignore during break
    timer.pause();
    onWorkComplete();
  });
}

openSettingsBtn.addEventListener('click', () => {
  openSettings();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === ' ') { e.preventDefault(); startPauseBtn.click(); }
  if (e.key === 'r' || e.key === 'R') resetBtn.click();
  if (e.key === 's' || e.key === 'S') skipBreakBtn.click();
  if (e.key === 'l' || e.key === 'L') logSessionBtn?.click();
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
  updateTabUI();
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
    updateTabUI();
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
    updateTabUI();
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
  updateTabUI();
}

function onWorkComplete() {
  audio.play(workEndSound);
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
  updateTabUI();
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
  // Play the selected break end sound before transitioning
  audio.play(breakEndSound);
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
  // Skip Session allowed when not in break
  skipSessionBtn.disabled = inBreak;
  if (logSessionBtn) logSessionBtn.disabled = inBreak;
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
  // sounds
  const workSel = settingsForm.querySelector('#setWorkEndSound');
  const breakSel = settingsForm.querySelector('#setBreakEndSound');
  if (workSel) workSel.value = s.workEndSound ?? 'bell';
  if (breakSel) breakSel.value = s.breakEndSound ?? 'bell';

  // wire test buttons (bind once per open for safety)
  const testWorkBtn = settingsForm.querySelector('#testWorkEndSoundBtn');
  const testBreakBtn = settingsForm.querySelector('#testBreakEndSoundBtn');
  if (testWorkBtn && workSel) {
    testWorkBtn.onclick = () => audio.play(workSel.value === 'bird' ? 'bird' : 'bell');
  }
  if (testBreakBtn && breakSel) {
    testBreakBtn.onclick = () => audio.play(breakSel.value === 'bird' ? 'bird' : 'bell');
  }

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
    muted: !!settingsForm.querySelector('#setMuted').checked,
    workEndSound: settingsForm.querySelector('#setWorkEndSound')?.value === 'bird' ? 'bird' : 'bell',
    breakEndSound: settingsForm.querySelector('#setBreakEndSound')?.value === 'bird' ? 'bird' : 'bell'
  };
  Storage.saveSettings(next);
  // apply
  state.targetToday = next.targetToday;
  state.autoStartBreak = next.autoStartBreak;
  state.autoStartNextWork = next.autoStartNextWork;
  audio.setVolume(next.volume);
  audio.setMuted(next.muted);
  workEndSound = next.workEndSound;
  breakEndSound = next.breakEndSound;
  document.documentElement.classList.toggle('high-contrast', !!settingsForm.querySelector('#setHighContrast').checked);
  updateProgress();
  settingsDialog.close();
});

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

// ---------- Tab title + favicon
function updateTabUI() {
  const base = 'Tea by the Window';
  const sec = Math.ceil(state.remainingMs / 1000);
  const time = formatMMSS(Math.max(0, sec));
  const mode = state.mode;
  if (mode === 'WORK_RUNNING' || mode === 'WORK_PAUSED') {
    document.title = `🟠 ${time} — ${base}`;
    const total = state.workDurationMs;
    const prog = 1 - Math.max(0, Math.min(1, state.remainingMs / total));
    setFavicon('#e09a54', prog); // warm amber from theme
  } else if (mode === 'BREAK_RUNNING' || mode === 'BREAK_PAUSED') {
    document.title = `🟢 ${time} — ${base}`;
    const total = state.breakDurationMs;
    const prog = 1 - Math.max(0, Math.min(1, state.remainingMs / total));
    setFavicon('#2e7d32', prog); // calm tea green
  } else {
    document.title = base;
    setFavicon(null);
  }
}

function setFavicon(color, progress) {
  const link = document.getElementById('dynamic-favicon');
  if (!link) return;
  if (!color) {
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
    return;
    }
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,size,size);
  const cx = size/2, cy = size/2;
  const radius = size/2 - 8;
  // background disc
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI*2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // background ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius-2, 0, Math.PI*2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.stroke();
  // progress ring
  const pct = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : 0;
  if (pct > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius-2, -Math.PI/2, -Math.PI/2 + pct * Math.PI*2);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  // center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI*2);
  ctx.fillStyle = color;
  ctx.fill();
  link.href = canvas.toDataURL('image/png');
}
