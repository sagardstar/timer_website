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

