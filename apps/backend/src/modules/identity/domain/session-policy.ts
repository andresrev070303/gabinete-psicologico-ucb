export const SESSION_POLICY = Object.freeze({
  idleMs: 30 * 60 * 1000,
  absoluteMs: 8 * 60 * 60 * 1000,
  activityIntervalMs: 60 * 1000,
  maxSessions: 2,
  failureWindowMs: 15 * 60 * 1000,
  maxFailures: 5,
});

export type SessionState = Readonly<{
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  sessionKind: string;
}>;

export function canUseSession(session: SessionState, now: number): boolean {
  const createdAt = Date.parse(session.createdAt);
  const lastSeenAt = Date.parse(session.lastSeenAt ?? session.createdAt);
  return (
    session.sessionKind === 'interactive' &&
    session.revokedAt === null &&
    createdAt <= now &&
    now < Date.parse(session.expiresAt) &&
    now - createdAt < SESSION_POLICY.absoluteMs &&
    now - lastSeenAt < SESSION_POLICY.idleMs
  );
}
