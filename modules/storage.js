const SETTINGS_KEY = 'tbw.settings.v2';
const ACTIVE_SESSION_KEY = 'tbw.activeSession.v1';
const BEVERAGE_TYPES = new Set(['black', 'matcha', 'coffee', 'water']);
let storageError = false;

const DEFAULT_SETTINGS = Object.freeze({
  targetToday: 4,
  autoStartBreak: true,
  autoStartNextWork: false,
  wellnessPrompts: false,
  notificationsEnabled: false,
  volume: 0.5,
  muted: false,
  workEndSound: 'bell',
  breakEndSound: 'bell',
  workMinutes: 25,
  breakMinutes: 5,
  beverage: 'black',
  animatedBackground: true,
  useRealSunTimes: false,
  highContrast: false,
  singleLetterShortcuts: true
});

function progressKey(dateKey) {
  return `tbw.progress.v1:${dateKey}`;
}

function fail(fallback) {
  storageError = true;
  return fallback;
}

function boundedInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeSettings(parsed = {}) {
  return {
    targetToday: boundedInt(parsed.targetToday, 1, 12, DEFAULT_SETTINGS.targetToday),
    autoStartBreak: parsed.autoStartBreak ?? DEFAULT_SETTINGS.autoStartBreak,
    autoStartNextWork: parsed.autoStartNextWork ?? DEFAULT_SETTINGS.autoStartNextWork,
    wellnessPrompts: parsed.wellnessPrompts ?? DEFAULT_SETTINGS.wellnessPrompts,
    notificationsEnabled: parsed.notificationsEnabled ?? DEFAULT_SETTINGS.notificationsEnabled,
    volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_SETTINGS.volume,
    muted: parsed.muted ?? DEFAULT_SETTINGS.muted,
    workEndSound: parsed.workEndSound === 'bird' ? 'bird' : 'bell',
    breakEndSound: parsed.breakEndSound === 'bird' ? 'bird' : 'bell',
    workMinutes: boundedInt(parsed.workMinutes, 1, 90, DEFAULT_SETTINGS.workMinutes),
    breakMinutes: boundedInt(parsed.breakMinutes, 1, 30, DEFAULT_SETTINGS.breakMinutes),
    beverage: typeof parsed.beverage === 'string' && BEVERAGE_TYPES.has(parsed.beverage) ? parsed.beverage : DEFAULT_SETTINGS.beverage,
    animatedBackground: parsed.animatedBackground ?? DEFAULT_SETTINGS.animatedBackground,
    useRealSunTimes: parsed.useRealSunTimes ?? DEFAULT_SETTINGS.useRealSunTimes,
    highContrast: parsed.highContrast ?? DEFAULT_SETTINGS.highContrast,
    singleLetterShortcuts: parsed.singleLetterShortcuts ?? DEFAULT_SETTINGS.singleLetterShortcuts
  };
}

function normalizeProgress(parsed = {}) {
  return {
    done: Math.max(0, boundedInt(parsed.done, 0, Number.MAX_SAFE_INTEGER, 0)),
    streak: Math.max(0, boundedInt(parsed.streak, 0, Number.MAX_SAFE_INTEGER, 0)),
    completions: Array.isArray(parsed.completions)
      ? parsed.completions.filter((entry) => entry && typeof entry.id === 'string').slice(-200)
      : []
  };
}

function readProgress(dateKey) {
  const raw = localStorage.getItem(progressKey(dateKey));
  return raw ? normalizeProgress(JSON.parse(raw)) : normalizeProgress();
}

function writeProgress(dateKey, progress) {
  localStorage.setItem(progressKey(dateKey), JSON.stringify(normalizeProgress(progress)));
}

async function withProgressLock(dateKey, operation) {
  // Web Locks serializes completion bookkeeping across tabs. Browsers without it
  // use the active session's single-owner policy plus stable completion IDs.
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(`tbw-progress:${dateKey}`, operation);
  }
  return operation();
}

export const Storage = {
  defaults: DEFAULT_SETTINGS,

  dateKey(date = new Date()) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  todayKey() {
    return this.dateKey(new Date());
  },

  hadError() {
    return storageError;
  },

  loadSettings() {
    try {
      const current = localStorage.getItem(SETTINGS_KEY);
      const legacy = current ? null : localStorage.getItem('tbw.settings.v1');
      if (!current && !legacy) return { ...DEFAULT_SETTINGS };
      return normalizeSettings(JSON.parse(current || legacy));
    } catch {
      return fail({ ...DEFAULT_SETTINGS });
    }
  },

  saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
      return true;
    } catch {
      return fail(false);
    }
  },

  loadTodayProgress(dateKey) {
    try {
      return readProgress(dateKey);
    } catch {
      return fail(normalizeProgress());
    }
  },

  saveTodayProgress(dateKey, data) {
    try {
      writeProgress(dateKey, data);
      return true;
    } catch {
      return fail(false);
    }
  },

  async recordCompletion(dateKey, completion) {
    try {
      return await withProgressLock(dateKey, () => {
        const current = readProgress(dateKey);
        if (current.completions.some((entry) => entry.id === completion.id)) {
          return { changed: false, progress: current };
        }
        const next = {
          done: current.done + 1,
          streak: current.streak + 1,
          completions: [...current.completions, completion].slice(-200)
        };
        writeProgress(dateKey, next);
        return { changed: true, progress: normalizeProgress(next) };
      });
    } catch {
      return fail({ changed: false, progress: this.loadTodayProgress(dateKey), failed: true });
    }
  },

  async undoCompletion(dateKey, completionId) {
    try {
      return await withProgressLock(dateKey, () => {
        const current = readProgress(dateKey);
        const entry = current.completions.find((item) => item.id === completionId);
        if (!entry || entry.kind !== 'offline') return { changed: false, progress: current };
        const next = {
          done: Math.max(0, current.done - 1),
          streak: Math.max(0, current.streak - 1),
          completions: current.completions.filter((item) => item.id !== completionId)
        };
        writeProgress(dateKey, next);
        return { changed: true, progress: normalizeProgress(next) };
      });
    } catch {
      return fail({ changed: false, progress: this.loadTodayProgress(dateKey), failed: true });
    }
  },

  loadActiveSession() {
    try {
      const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return fail(null);
    }
  },

  saveActiveSession(session) {
    try {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
      return true;
    } catch {
      return fail(false);
    }
  },

  clearActiveSession(sessionId) {
    try {
      const current = this.loadActiveSession();
      if (!current || !sessionId || current.sessionId === sessionId) {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
      return true;
    } catch {
      return fail(false);
    }
  }
};
