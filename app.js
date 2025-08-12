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
