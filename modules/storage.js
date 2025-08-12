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

