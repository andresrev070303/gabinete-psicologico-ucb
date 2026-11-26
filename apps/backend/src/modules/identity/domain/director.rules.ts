export type DirectorCandidate = Readonly<{
  accountId: string;
  status: string;
  personActive: boolean;
  activatedCandidate: boolean;
  roleHistory: readonly string[];
}>;

export function canDesignateDirector(
  actorId: string,
  target: DirectorCandidate,
): boolean {
  return (
    target.accountId !== actorId &&
    target.status === 'active' &&
    target.personActive &&
    target.activatedCandidate &&
    target.roleHistory.every((role) => role === 'director')
  );
}

export function requiresRecentAuthentication(
  createdAt: number,
  now: number,
): boolean {
  return (
    !Number.isFinite(createdAt) ||
    createdAt > now ||
    now - createdAt >= 10 * 60 * 1000
  );
}
