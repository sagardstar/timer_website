import { AppState } from './modules/state.js';
import { createTimer } from './modules/timer.js';
import { Storage } from './modules/storage.js';
import { createSession, restoreSession, updateSession, completionDateKey, createId } from './modules/session.js';
import { createAudio } from './modules/audio.js';
import { Nudges } from './modules/nudges/index.js';
import { createUIAdapter } from './modules/ui/messages.js';
import { bindTeaLevel, setBreakVisual, initAmbientSky, updateAmbientSettings, setSunsetMode } from './modules/animations.js';

const $ = (id) => document.getElementById(id);
const timerEl = $('timer');
const stateLabelEl = $('stateLabel');
const startPauseBtn = $('startPauseBtn');
const skipBreakBtn = $('skipBreakBtn');
const moreActions = $('moreActions');
const logSessionBtn = $('logSessionBtn');
const logSessionHelp = $('logSessionHelp');
const finishEarlyBtn = $('finishEarlyBtn');
const restartBtn = $('restartBtn');
const actionPanel = $('actionPanel');
const moodLineEl = $('moodLine');
const durationSummaryBtn = $('durationSummary');
const doneCountEl = $('doneCount');
const targetCountEl = $('targetCount');
const openSettingsBtn = $('openSettings');
const settingsDialog = $('settingsDialog');
const settingsForm = $('settingsForm');
const setWorkMinEl = $('setWorkMin');
const setBreakMinEl = $('setBreakMin');
const setBeverageEl = $('setBeverage');
const ui = createUIAdapter();

let settings = Storage.loadSettings();
let displayedDateKey = Storage.todayKey();
let displayedProgress = Storage.loadTodayProgress(displayedDateKey);
let activeSession = Storage.loadActiveSession();
let restored = activeSession ? restoreSession(activeSession) : null;
let contextMessage = '';
let transitioning = false;
let randomPromptHandle = null;
let lastWhole = null;
let goalWasReached = displayedProgress.done >= settings.targetToday;
let storageWarningShown = false;

const tabOwnerId = getTabOwnerId();
let foreignSession = !!(activeSession?.ownerId && activeSession.ownerId !== tabOwnerId);
if (restored?.kind === 'invalid') {
  Storage.clearActiveSession(activeSession?.sessionId);
  activeSession = null;
  restored = null;
  foreignSession = false;
}
if (activeSession && !activeSession.ownerId) {
  activeSession.ownerId = tabOwnerId;
  Storage.saveActiveSession(activeSession);
}

const restoredMode = restored?.kind === 'active' ? modeFor(restored.record.phase, restored.record.status) : 'IDLE';
const state = new AppState({
  mode: restoredMode,
  workDurationMs: settings.workMinutes * 60_000,
  breakDurationMs: settings.breakMinutes * 60_000,
  remainingMs: restored?.kind === 'active' ? restored.remainingMs : settings.workMinutes * 60_000,
  doneToday: displayedProgress.done,
  targetToday: settings.targetToday,
  autoStartBreak: settings.autoStartBreak,
  autoStartNextWork: settings.autoStartNextWork,
  streakCount: displayedProgress.streak
});
state.phaseDurationMs = restored?.record.phaseDurationMs ?? state.workDurationMs;

document.documentElement.classList.toggle('high-contrast', settings.highContrast);
const audio = createAudio({ volume: settings.volume, muted: settings.muted });
audio.load('bell', './public/assets/sounds/bell.mp3');
audio.load('bird', './public/assets/sounds/bird-sound.mp3');
audio.load('startClink', './public/assets/sounds/bell.mp3');
const teaLevelBinder = bindTeaLevel(document.querySelector('.tea'));
updateBeverageVisual(settings.beverage);

const timer = createTimer({
  onTick(ms) {
    state.remainingMs = ms;
    const whole = Math.ceil(ms / 1000);
    if (whole !== lastWhole) {
      lastWhole = whole;
      renderClock();
    }
    if (state.mode === 'WORK_RUNNING') {
      teaLevelBinder(state.phaseDurationMs - ms, state.phaseDurationMs);
    }
  },
  onDone() {
    void handleTimerDone(false);
  }
});

initAmbientSky({
  animatedBackground: settings.animatedBackground,
  useRealSunTimes: settings.useRealSunTimes
});
renderUI();
checkStorageHealth();

if (restored?.kind === 'expired' && !foreignSession) {
  state.mode = modeFor(restored.record.phase, 'running');
  state.phaseDurationMs = restored.record.phaseDurationMs;
  state.remainingMs = 0;
  void handleTimerDone(true);
} else if (restored?.kind === 'active' && !foreignSession) {
  if (restored.record.status === 'running') timer.start(restored.remainingMs);
  else timer.reset(restored.remainingMs);
  if (state.mode === 'WORK_RUNNING') scheduleWorkPrompt();
} else if (foreignSession) {
  contextMessage = 'This session is active in another tab.';
  renderUI();
}

startPauseBtn.addEventListener('click', handlePrimaryAction);
skipBreakBtn.addEventListener('click', skipBreak);
logSessionBtn.addEventListener('click', () => void logOfflineSession());
finishEarlyBtn.addEventListener('click', showFinishEarlyConfirmation);
restartBtn.addEventListener('click', showRestartConfirmation);
openSettingsBtn.addEventListener('click', () => openSettings());
durationSummaryBtn.addEventListener('click', () => openSettings(setWorkMinEl));

document.addEventListener('keydown', handleShortcut);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') reconcileRunningSession();
});
window.addEventListener('focus', reconcileRunningSession);
window.addEventListener('storage', handleStorageEvent);
setInterval(refreshDisplayedDay, 60_000);

function modeFor(phase, status) {
  if (phase === 'work') return status === 'running' ? 'WORK_RUNNING' : 'WORK_PAUSED';
  if (status === 'ready') return 'BREAK_READY';
  return status === 'running' ? 'BREAK_RUNNING' : 'BREAK_PAUSED';
}

function formatMMSS(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const seconds = (safe % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function renderClock() {
  const seconds = Math.ceil(state.remainingMs / 1000);
  timerEl.textContent = formatMMSS(seconds);
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  timerEl.setAttribute('aria-label', `${minutesPart} minute${minutesPart === 1 ? '' : 's'} ${secondsPart} second${secondsPart === 1 ? '' : 's'} remaining`);
  updateTabUI();
}

function viewForMode() {
  const views = {
    IDLE: { label: 'Focus', action: 'Start focus', mood: 'The kettle is on. Ready to focus?' },
    WORK_RUNNING: { label: 'Focus', action: 'Pause', mood: 'Focus session in progress.' },
    WORK_PAUSED: { label: 'Focus paused', action: 'Resume', mood: 'Paused. Your remaining time is saved.' },
    BREAK_READY: { label: 'Break ready', action: 'Start break', mood: 'Your break is ready when you are.' },
    BREAK_RUNNING: { label: 'Break', action: 'Pause', mood: 'Break in progress. Take a slow sip.' },
    BREAK_PAUSED: { label: 'Break paused', action: 'Resume', mood: 'Break paused. Resume whenever you are ready.' }
  };
  return views[state.mode] || views.IDLE;
}

function renderUI({ announce = false } = {}) {
  const view = viewForMode();
  const inBreak = state.mode.startsWith('BREAK');
  const inWork = state.mode.startsWith('WORK');
  stateLabelEl.textContent = view.label;
  startPauseBtn.textContent = view.action;
  startPauseBtn.disabled = foreignSession || transitioning;
  moodLineEl.textContent = contextMessage || view.mood;
  document.body.classList.toggle('break-active', inBreak);
  setBreakVisual(inBreak);

  skipBreakBtn.hidden = !inBreak;
  moreActions.hidden = inBreak;
  logSessionBtn.hidden = state.mode !== 'IDLE';
  logSessionHelp.hidden = state.mode !== 'IDLE';
  finishEarlyBtn.hidden = !inWork;
  restartBtn.hidden = !inWork;
  if (!inWork && state.mode !== 'IDLE') moreActions.open = false;

  durationSummaryBtn.textContent = state.mode === 'IDLE'
    ? `${settings.workMinutes} min focus · ${settings.breakMinutes} min break`
    : inWork
      ? `Next: ${settings.breakMinutes} min break`
      : `Next: ${settings.workMinutes} min focus`;
  durationSummaryBtn.setAttribute('aria-label', `${durationSummaryBtn.textContent}. Edit timer durations`);
  updateProgress();
  renderClock();
  updateTeaLevel();
  if (announce) announceText(`${view.label}. ${view.action}. ${formatMMSS(Math.ceil(state.remainingMs / 1000))} remaining.`);
}

function updateProgress() {
  doneCountEl.textContent = String(state.doneToday);
  targetCountEl.textContent = String(state.targetToday);
  setSunsetMode(state.doneToday >= state.targetToday);
}

function updateTeaLevel() {
  if (state.mode.startsWith('WORK')) teaLevelBinder(state.phaseDurationMs - state.remainingMs, state.phaseDurationMs);
  else teaLevelBinder(0, state.workDurationMs);
}

function handlePrimaryAction() {
  if (foreignSession || transitioning) return;
  clearActionPanel();
  if (state.mode === 'IDLE') startWork();
  else if (state.mode === 'WORK_RUNNING' || state.mode === 'BREAK_RUNNING') pauseTimer();
  else if (state.mode === 'BREAK_READY') startReadyBreak();
  else if (state.mode === 'WORK_PAUSED' || state.mode === 'BREAK_PAUSED') resumeTimer();
}

function startWork() {
  clearPrompt();
  contextMessage = '';
  audio.play('startClink');
  state.mode = 'WORK_RUNNING';
  state.phaseDurationMs = state.workDurationMs;
  state.remainingMs = state.phaseDurationMs;
  activeSession = createSession({ phase: 'work', status: 'running', durationMs: state.phaseDurationMs });
  activeSession.ownerId = tabOwnerId;
  saveActiveSession();
  lastWhole = null;
  timer.start(state.remainingMs);
  renderUI({ announce: true });
  scheduleWorkPrompt();
}

function pauseTimer() {
  if (state.mode !== 'WORK_RUNNING' && state.mode !== 'BREAK_RUNNING') return;
  timer.pause();
  state.remainingMs = timer.getRemaining();
  state.mode = state.mode === 'WORK_RUNNING' ? 'WORK_PAUSED' : 'BREAK_PAUSED';
  activeSession = updateSession(activeSession, { status: 'paused', remainingMs: state.remainingMs, pausedAt: Date.now() });
  saveActiveSession();
  clearPrompt();
  contextMessage = '';
  renderUI({ announce: true });
}

function resumeTimer() {
  if (state.mode !== 'WORK_PAUSED' && state.mode !== 'BREAK_PAUSED') return;
  const pauseMinutes = activeSession?.pausedAt ? Math.floor((Date.now() - activeSession.pausedAt) / 60_000) : 0;
  state.mode = state.mode === 'WORK_PAUSED' ? 'WORK_RUNNING' : 'BREAK_RUNNING';
  activeSession = updateSession(activeSession, { status: 'running', remainingMs: state.remainingMs, pausedAt: null });
  saveActiveSession();
  timer.resume();
  contextMessage = '';
  renderUI({ announce: true });
  if (state.mode === 'WORK_RUNNING') {
    Nudges.onResumeAfterPause({ pauseMinutes, ui });
    scheduleWorkPrompt();
  }
}

function startReadyBreak() {
  if (state.mode !== 'BREAK_READY') return;
  state.mode = 'BREAK_RUNNING';
  activeSession = updateSession(activeSession, { status: 'running', remainingMs: state.remainingMs });
  saveActiveSession();
  timer.start(state.remainingMs);
  contextMessage = '';
  renderUI({ announce: true });
  Nudges.onBreakStart({ ui });
}

function startBreak(sessionId = activeSession?.sessionId ?? createId()) {
  clearPrompt();
  state.mode = 'BREAK_RUNNING';
  state.phaseDurationMs = state.breakDurationMs;
  state.remainingMs = state.phaseDurationMs;
  activeSession = createSession({ phase: 'break', status: 'running', durationMs: state.phaseDurationMs, sessionId });
  activeSession.ownerId = tabOwnerId;
  saveActiveSession();
  lastWhole = null;
  timer.start(state.remainingMs);
  contextMessage = '';
  renderUI({ announce: true });
  setTimeout(() => Nudges.onBreakStart({ ui }), 200);
}

function enterBreakReady(sessionId = activeSession?.sessionId ?? createId(), message = '') {
  clearPrompt();
  state.mode = 'BREAK_READY';
  state.phaseDurationMs = state.breakDurationMs;
  state.remainingMs = state.phaseDurationMs;
  activeSession = createSession({ phase: 'break', status: 'ready', durationMs: state.phaseDurationMs, sessionId });
  activeSession.ownerId = tabOwnerId;
  saveActiveSession();
  lastWhole = null;
  timer.reset(state.remainingMs);
  contextMessage = message;
  renderUI({ announce: true });
}

async function handleTimerDone(recovered) {
  if (transitioning) return;
  transitioning = true;
  clearPrompt();
  const phase = activeSession?.phase || (state.mode.startsWith('BREAK') ? 'break' : 'work');
  try {
    if (phase === 'work') await completeWork({ recovered });
    else completeBreak({ recovered });
  } finally {
    transitioning = false;
    renderUI();
  }
}

async function completeWork({ recovered = false, count = true, completionAt = null } = {}) {
  const finished = activeSession;
  if (count && finished) {
    const dateKey = completionAt ? Storage.dateKey(new Date(completionAt)) : completionDateKey(finished);
    const result = await Storage.recordCompletion(dateKey, {
      id: finished.completionId,
      kind: recovered ? 'recovered-timer' : 'timer',
      createdAt: completionAt ?? finished.endAt ?? Date.now()
    });
    if (result.failed) checkStorageHealth();
    if (dateKey === displayedDateKey) applyProgress(result.progress, { announceThreshold: result.changed });
  }
  if (!recovered) {
    audio.play(settings.workEndSound);
    maybeNotify('Focus complete', 'Time for a break.');
  }
  const sessionId = finished?.sessionId;
  if (recovered) {
    enterBreakReady(sessionId, 'Focus completed while you were away. It was counted once; start your break when ready.');
  } else if (state.autoStartBreak) {
    startBreak(sessionId);
  } else {
    enterBreakReady(sessionId);
  }
}

function completeBreak({ recovered = false } = {}) {
  if (!recovered) {
    audio.play(settings.breakEndSound);
    maybeNotify('Break complete', 'Ready to focus again?');
  }
  if (!recovered && state.autoStartNextWork) startWork();
  else resetToIdle(recovered ? 'Break completed while you were away. Start focus when you are ready.' : 'Break complete. Start focus when you are ready.');
}

function resetToIdle(message = '') {
  clearPrompt();
  const oldId = activeSession?.sessionId;
  state.mode = 'IDLE';
  state.phaseDurationMs = state.workDurationMs;
  state.remainingMs = state.workDurationMs;
  activeSession = null;
  Storage.clearActiveSession(oldId);
  lastWhole = null;
  timer.reset(state.remainingMs);
  contextMessage = message;
  clearActionPanel();
  renderUI({ announce: true });
}

function skipBreak() {
  if (!state.mode.startsWith('BREAK')) return;
  timer.pause();
  if (state.autoStartNextWork) startWork();
  else resetToIdle('Break skipped. Start focus when you are ready.');
}

async function logOfflineSession() {
  if (state.mode !== 'IDLE' || transitioning) return;
  transitioning = true;
  const dateKey = Storage.todayKey();
  const completionId = `offline:${createId()}`;
  const result = await Storage.recordCompletion(dateKey, { id: completionId, kind: 'offline', createdAt: Date.now() });
  transitioning = false;
  if (result.failed) checkStorageHealth();
  if (dateKey === displayedDateKey) applyProgress(result.progress, { announceThreshold: result.changed });
  moreActions.open = false;
  if (result.changed) {
    ui.showActionMessage('Session added.', 'Undo', async () => {
      const undo = await Storage.undoCompletion(dateKey, completionId);
      if (dateKey === displayedDateKey) applyProgress(undo.progress);
      announceText(undo.changed ? 'Offline session removed.' : 'That session was already changed.');
      if (undo.failed) checkStorageHealth();
    });
  }
  renderUI();
}

function showFinishEarlyConfirmation() {
  moreActions.open = false;
  showActionPanel('Finish this focus session?', [
    ['Count session & take break', async () => {
      timer.pause();
      transitioning = true;
      await completeWork({ count: true, completionAt: Date.now() });
      transitioning = false;
      renderUI();
    }],
    ['Discard & take break', () => {
      timer.pause();
      const sessionId = activeSession?.sessionId;
      if (state.autoStartBreak) startBreak(sessionId);
      else enterBreakReady(sessionId);
    }],
    ['Keep focusing', clearActionPanel]
  ]);
}

function showRestartConfirmation() {
  moreActions.open = false;
  if (!state.mode.startsWith('WORK')) return;
  showActionPanel('Restarting will discard the elapsed time in this focus session.', [
    ['Restart focus', () => { timer.pause(); startWork(); }],
    ['Keep current session', clearActionPanel]
  ]);
}

function showActionPanel(text, actions) {
  actionPanel.replaceChildren();
  const message = document.createElement('p');
  message.textContent = text;
  const controls = document.createElement('div');
  for (const [label, handler] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', handler, { once: true });
    controls.appendChild(button);
  }
  actionPanel.append(message, controls);
  actionPanel.hidden = false;
  controls.querySelector('button')?.focus();
}

function clearActionPanel() {
  actionPanel.hidden = true;
  actionPanel.replaceChildren();
}

function scheduleWorkPrompt() {
  clearPrompt();
  randomPromptHandle = Nudges.scheduleRandomForWork({
    settings,
    ui,
    shouldShow: () => state.mode === 'WORK_RUNNING' && settings.wellnessPrompts
  });
}

function clearPrompt() {
  if (randomPromptHandle?.id) clearTimeout(randomPromptHandle.id);
  randomPromptHandle = null;
}

function applyProgress(progress, { announceThreshold = false } = {}) {
  displayedProgress = progress;
  state.doneToday = progress.done;
  state.streakCount = progress.streak;
  const reached = state.doneToday >= state.targetToday;
  updateProgress();
  if (announceThreshold && reached && !goalWasReached) Nudges.onDayGoalReached({ ui });
  goalWasReached = reached;
}

function refreshDisplayedDay() {
  const current = Storage.todayKey();
  if (current === displayedDateKey) return;
  displayedDateKey = current;
  const progress = Storage.loadTodayProgress(current);
  goalWasReached = progress.done >= state.targetToday;
  applyProgress(progress);
  renderUI();
}

function reconcileRunningSession() {
  refreshDisplayedDay();
  if (foreignSession || !activeSession || activeSession.status !== 'running') return;
  const result = restoreSession(activeSession);
  if (result.kind === 'expired') {
    timer.pause();
    state.remainingMs = 0;
    void handleTimerDone(true);
  } else if (result.kind === 'active') {
    state.remainingMs = result.remainingMs;
    timer.start(result.remainingMs);
    renderClock();
  }
}

function handleStorageEvent(event) {
  if (event.key === `tbw.progress.v1:${displayedDateKey}`) {
    applyProgress(Storage.loadTodayProgress(displayedDateKey));
  }
  if (event.key === 'tbw.activeSession.v1' && foreignSession) {
    if (!event.newValue) {
      foreignSession = false;
      activeSession = null;
      resetToIdle('The session in the other tab ended.');
      return;
    }
    try {
      const next = JSON.parse(event.newValue);
      const recovered = restoreSession(next);
      if (recovered.kind === 'active') {
        activeSession = next;
        state.mode = modeFor(next.phase, next.status);
        state.phaseDurationMs = next.phaseDurationMs;
        state.remainingMs = recovered.remainingMs;
        contextMessage = 'This session is active in another tab.';
        renderUI();
      }
    } catch {
      // The owning tab may be between writes; its next valid update will sync.
    }
  }
}

function handleShortcut(event) {
  if (!settings.singleLetterShortcuts || event.defaultPrevented || event.repeat || event.isComposing) return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (settingsDialog.open || isInteractiveTarget(event.target)) return;
  const key = event.key.toLowerCase();
  if (key === ' ') {
    event.preventDefault();
    handlePrimaryAction();
  } else if (key === 'l' && state.mode === 'IDLE') {
    void logOfflineSession();
  } else if (key === 'r' && state.mode.startsWith('WORK')) {
    showRestartConfirmation();
  } else if (key === 's' && state.mode.startsWith('BREAK')) {
    skipBreak();
  }
}

function isInteractiveTarget(target) {
  return target instanceof Element && !!target.closest('input, select, textarea, button, summary, [contenteditable="true"]');
}

function openSettings(focusAfterOpen = null) {
  populateSettingsForm();
  settingsDialog.showModal();
  if (focusAfterOpen) requestAnimationFrame(() => focusAfterOpen.focus());
}

function populateSettingsForm() {
  setWorkMinEl.value = String(settings.workMinutes);
  setBreakMinEl.value = String(settings.breakMinutes);
  setBeverageEl.value = settings.beverage;
  $('setTarget').value = String(settings.targetToday);
  $('setAutoBreak').checked = settings.autoStartBreak;
  $('setAutoNext').checked = settings.autoStartNextWork;
  $('setWellness').checked = settings.wellnessPrompts;
  $('setNotifications').checked = settings.notificationsEnabled;
  $('setVolume').value = String(settings.volume);
  $('setMuted').checked = settings.muted;
  $('setWorkEndSound').value = settings.workEndSound;
  $('setBreakEndSound').value = settings.breakEndSound;
  $('setHighContrast').checked = settings.highContrast;
  $('setAnimatedBg').checked = settings.animatedBackground;
  $('setRealSunTimes').checked = settings.useRealSunTimes;
  $('setShortcuts').checked = settings.singleLetterShortcuts;
  $('durationApplyNote').hidden = state.mode === 'IDLE';
  settingsForm.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
  updateNotificationHelp();
}

$('cancelSettingsBtn').addEventListener('click', closeSettings);
$('closeSettingsBtn').addEventListener('click', closeSettings);
settingsDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeSettings(); });
settingsForm.addEventListener('submit', (event) => { event.preventDefault(); void saveSettings(); });
$('setNotifications').addEventListener('change', updateNotificationHelp);
$('testWorkEndSoundBtn').addEventListener('click', () => previewDraftSound($('setWorkEndSound').value));
$('testBreakEndSoundBtn').addEventListener('click', () => previewDraftSound($('setBreakEndSound').value));

function closeSettings() {
  settingsDialog.close();
  openSettingsBtn.focus();
}

function validateNumberField(input, errorId, label) {
  const value = Number(input.value);
  const min = Number(input.min);
  const max = Number(input.max);
  const error = $(errorId);
  if (!Number.isInteger(value) || value < min || value > max) {
    error.textContent = `${label} must be a whole number from ${min} to ${max}.`;
    input.setAttribute('aria-invalid', 'true');
    return false;
  }
  error.textContent = '';
  input.removeAttribute('aria-invalid');
  return true;
}

async function saveSettings() {
  const validations = [
    [setWorkMinEl, 'workMinError', 'Focus duration'],
    [setBreakMinEl, 'breakMinError', 'Break duration'],
    [$('setTarget'), 'targetError', 'Daily target']
  ];
  const valid = validations.map((args) => validateNumberField(...args)).every(Boolean);
  if (!valid) {
    validations.find(([input]) => input.getAttribute('aria-invalid') === 'true')?.[0].focus();
    return;
  }

  let notificationsEnabled = $('setNotifications').checked;
  if (notificationsEnabled) {
    if (!('Notification' in window) || Notification.permission === 'denied') {
      notificationsEnabled = false;
      $('notificationHelp').textContent = 'Notifications are unavailable or blocked in this browser.';
      $('setNotifications').checked = false;
      return;
    }
    if (Notification.permission !== 'granted') {
      try {
        notificationsEnabled = await Notification.requestPermission() === 'granted';
      } catch {
        notificationsEnabled = false;
      }
      if (!notificationsEnabled) {
        $('notificationHelp').textContent = 'Notification permission was not granted. Your other changes are still here.';
        $('setNotifications').checked = false;
        return;
      }
    }
  }

  const next = {
    workMinutes: Number(setWorkMinEl.value),
    breakMinutes: Number(setBreakMinEl.value),
    targetToday: Number($('setTarget').value),
    beverage: setBeverageEl.value,
    autoStartBreak: $('setAutoBreak').checked,
    autoStartNextWork: $('setAutoNext').checked,
    wellnessPrompts: $('setWellness').checked,
    notificationsEnabled,
    volume: Number($('setVolume').value),
    muted: $('setMuted').checked,
    workEndSound: $('setWorkEndSound').value,
    breakEndSound: $('setBreakEndSound').value,
    highContrast: $('setHighContrast').checked,
    animatedBackground: $('setAnimatedBg').checked,
    useRealSunTimes: $('setRealSunTimes').checked,
    singleLetterShortcuts: $('setShortcuts').checked
  };
  const wellnessWasEnabled = settings.wellnessPrompts;
  const reachedBeforeTargetChange = state.doneToday >= state.targetToday;
  settings = next;
  if (!Storage.saveSettings(settings)) checkStorageHealth();
  state.workDurationMs = settings.workMinutes * 60_000;
  state.breakDurationMs = settings.breakMinutes * 60_000;
  state.targetToday = settings.targetToday;
  state.autoStartBreak = settings.autoStartBreak;
  state.autoStartNextWork = settings.autoStartNextWork;
  if (state.mode === 'IDLE') {
    state.phaseDurationMs = state.workDurationMs;
    state.remainingMs = state.workDurationMs;
    timer.reset(state.remainingMs);
  }
  audio.setVolume(settings.volume);
  audio.setMuted(settings.muted);
  updateBeverageVisual(settings.beverage);
  document.documentElement.classList.toggle('high-contrast', settings.highContrast);
  updateAmbientSettings({ animatedBackground: settings.animatedBackground, useRealSunTimes: settings.useRealSunTimes });
  if (wellnessWasEnabled && !settings.wellnessPrompts) clearPrompt();
  else if (state.mode === 'WORK_RUNNING') scheduleWorkPrompt();
  const reachedAfterTargetChange = state.doneToday >= state.targetToday;
  if (!reachedBeforeTargetChange && reachedAfterTargetChange) Nudges.onDayGoalReached({ ui });
  goalWasReached = reachedAfterTargetChange;
  renderUI();
  settingsDialog.close();
  openSettingsBtn.focus();
}

function previewDraftSound(name) {
  audio.preview(name === 'bird' ? 'bird' : 'bell', {
    volume: Number($('setVolume').value),
    muted: $('setMuted').checked
  });
}

function updateNotificationHelp() {
  const help = $('notificationHelp');
  if (!$('setNotifications').checked) help.textContent = '';
  else if (!('Notification' in window)) help.textContent = 'Notifications are not supported in this browser.';
  else if (Notification.permission === 'denied') help.textContent = 'Notifications are blocked in your browser settings.';
  else help.textContent = 'Permission will be requested when you save.';
}

function updateBeverageVisual(type) {
  const tea = document.querySelector('.tea');
  if (!tea) return;
  const colors = { black: '#6d3f20', matcha: '#669d4f', coffee: '#3b2618', water: '#b9e3ee' };
  tea.style.backgroundColor = colors[type] || colors.black;
}

function updateTabUI() {
  const base = 'Tea by the Window';
  const time = formatMMSS(Math.ceil(state.remainingMs / 1000));
  const view = viewForMode();
  if (state.mode === 'IDLE') {
    document.title = base;
    setFavicon(null);
    return;
  }
  document.title = `${view.label} · ${time} — ${base}`;
  const total = state.phaseDurationMs || 1;
  const progress = 1 - Math.max(0, Math.min(1, state.remainingMs / total));
  setFavicon(state.mode.startsWith('WORK') ? '#e09a54' : '#2e7d32', progress);
}

function setFavicon(color, progress = 0) {
  const link = $('dynamic-favicon');
  if (!link) return;
  if (!color) {
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.beginPath(); ctx.arc(32, 32, 24, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.stroke();
  if (progress > 0) { ctx.beginPath(); ctx.arc(32, 32, 22, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(32, 32, 6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  link.href = canvas.toDataURL('image/png');
}

function announceText(text) {
  const live = $('aria-live');
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 10);
}

function maybeNotify(title, body) {
  if (!settings.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
  try {
    const notification = new Notification(title, { body });
    notification.onclick = () => { window.focus(); notification.close(); };
  } catch {}
}

function saveActiveSession() {
  if (!Storage.saveActiveSession(activeSession)) checkStorageHealth();
}

function checkStorageHealth() {
  if (!Storage.hadError() || storageWarningShown) return;
  storageWarningShown = true;
  ui.showMessage("Progress can't be saved in this browser.", 'random');
}

function getTabOwnerId() {
  try {
    let id = sessionStorage.getItem('tbw.tabOwner.v1');
    if (!id) {
      id = createId();
      sessionStorage.setItem('tbw.tabOwner.v1', id);
    }
    return id;
  } catch {
    return createId();
  }
}
