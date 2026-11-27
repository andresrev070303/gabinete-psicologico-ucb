import { OPERATIONAL_ROLE_CODES } from './identity-catalog.js';
import { hasControlCharacters } from './identity-input.js';

export type OperationalRole = (typeof OPERATIONAL_ROLE_CODES)[number];
export function isOperationalRole(value: unknown): value is OperationalRole {
  return OPERATIONAL_ROLE_CODES.some((role) => role === value);
}
export function canManageOperationalAccount(
  actorId: string,
  target: { accountId: string; roleHistory: readonly string[] },
): boolean {
  return (
    actorId !== target.accountId &&
    target.roleHistory.some(isOperationalRole) &&
    !target.roleHistory.some(
      (role) => role === 'administrator' || role === 'director',
    )
  );
}
export function validateOperationalRoles(
  value: unknown,
  allowEmpty = false,
): OperationalRole[] {
  if (
    !Array.isArray(value) ||
    value.length > 3 ||
    (!allowEmpty && value.length === 0) ||
    !value.every(isOperationalRole) ||
    new Set(value).size !== value.length
  ) {
    throw new Error('Select distinct predefined operational roles.');
  }
  return [...value].sort();
}
export function normalizeContactPhone(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (
    typeof value !== 'string' ||
    value.trim().length > 50 ||
    !/^[+\d\s().-]+$/u.test(value) ||
    hasControlCharacters(value)
  )
    throw new Error('Provide a valid contact phone number.');
  return value.trim() || null;
}
export function normalizeDisableReason(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < 5 ||
    value.trim().length > 240 ||
    hasControlCharacters(value)
  )
    throw new Error('Provide a reason of 5 to 240 printable characters.');
  return value.trim();
}
