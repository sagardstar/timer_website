export const NUDGE_CONFIG = {
  RESUME_THRESHOLD_MIN: 5,          // paused ≥ 5 min → resume nudge
  STREAK_INTERVAL: 2,               // every 2 sessions → streak nudge
  RANDOM_ENABLED_DEFAULT: false,
  RANDOM_WITHIN_MIN_RANGE: [8, 18], // one random minute during work
  MESSAGE_COOLDOWN_MS: 30_000,
  NO_REPEAT_WINDOW: 3
};

