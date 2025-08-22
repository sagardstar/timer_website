const SETTINGS_KEY = 'tbw.settings.v2';

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
      // Attempt to read v2 first; if missing, try v1 and upgrade
      let raw = localStorage.getItem(SETTINGS_KEY);
      let parsed;
      if (!raw) {
        const legacy = localStorage.getItem('tbw.settings.v1');
        parsed = legacy ? JSON.parse(legacy) : null;
      } else {
        parsed = JSON.parse(raw);
      }
      if (!parsed) return {
        targetToday: 4,
        autoStartBreak: true,
        autoStartNextWork: true,
        wellnessPrompts: false,
        notificationsEnabled: false,
        volume: 0.5,
        muted: false,
        workEndSound: 'bell',
        breakEndSound: 'bell'
      };
      return {
        targetToday: parsed.targetToday ?? 4,
        autoStartBreak: parsed.autoStartBreak ?? true,
        autoStartNextWork: parsed.autoStartNextWork ?? true,
        wellnessPrompts: parsed.wellnessPrompts ?? false,
        notificationsEnabled: parsed.notificationsEnabled ?? false,
        volume: parsed.volume ?? 0.5,
        muted: parsed.muted ?? false,
        workEndSound: parsed.workEndSound ?? 'bell',
        breakEndSound: parsed.breakEndSound ?? 'bell'
      };
    } catch {
      return { targetToday: 4, autoStartBreak: true, autoStartNextWork: true, wellnessPrompts: false, notificationsEnabled: false, volume: 0.5, muted: false, workEndSound: 'bell', breakEndSound: 'bell' };
    }
  },

  saveSettings(s) {
    const next = {
      targetToday: s.targetToday ?? 4,
      autoStartBreak: !!s.autoStartBreak,
      autoStartNextWork: !!s.autoStartNextWork,
      wellnessPrompts: !!s.wellnessPrompts,
      notificationsEnabled: !!s.notificationsEnabled,
      volume: typeof s.volume === 'number' ? s.volume : 0.5,
      muted: !!s.muted,
      workEndSound: s.workEndSound === 'bird' ? 'bird' : 'bell',
      breakEndSound: s.breakEndSound === 'bird' ? 'bird' : 'bell'
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
