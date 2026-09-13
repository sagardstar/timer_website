const PHASES = new Set(['work', 'break']);
const STATUSES = new Set(['running', 'paused', 'ready']);

export function createSession({ phase, status, durationMs, remainingMs = durationMs, now = Date.now(), sessionId = createId() }) {
  const safeRemaining = Math.max(0, Math.min(durationMs, remainingMs));
  return {
    version: 1,
    sessionId,
    phase,
    status,
    phaseDurationMs: durationMs,
    remainingMs: safeRemaining,
    endAt: status === 'running' ? now + safeRemaining : null,
    completionId: `${sessionId}:${phase}`,
    updatedAt: now
  };
}

export function restoreSession(record, now = Date.now()) {
  if (!isValidSession(record)) return { kind: 'invalid' };
  const remainingMs = record.status === 'running'
    ? Math.max(0, record.endAt - now)
    : Math.max(0, Math.min(record.phaseDurationMs, record.remainingMs));
  return {
    kind: record.status === 'running' && remainingMs <= 0 ? 'expired' : 'active',
    record: { ...record, remainingMs },
    remainingMs
  };
}

export function updateSession(record, changes, now = Date.now()) {
  const next = { ...record, ...changes, updatedAt: now };
  if (next.status === 'running' && !Number.isFinite(changes.endAt)) {
    next.endAt = now + next.remainingMs;
  }
  if (next.status !== 'running') next.endAt = null;
  return next;
}

export function completionDateKey(record, fallbackNow = Date.now()) {
  const timestamp = Number.isFinite(record?.endAt) ? record.endAt : fallbackNow;
  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function isValidSession(record) {
  return !!record
    && record.version === 1
    && typeof record.sessionId === 'string'
    && PHASES.has(record.phase)
    && STATUSES.has(record.status)
    && Number.isFinite(record.phaseDurationMs)
    && record.phaseDurationMs > 0
    && Number.isFinite(record.remainingMs)
    && typeof record.completionId === 'string'
    && (record.status !== 'running' || Number.isFinite(record.endAt));
}

export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
