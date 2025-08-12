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

