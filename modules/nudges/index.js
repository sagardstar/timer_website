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

