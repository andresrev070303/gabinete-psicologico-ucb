export function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
export function normalizeIdentityName(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Array.from(value.trim()).length > 160 ||
    hasControlCharacters(value)
  ) {
    throw new Error(
      `${field} must contain between 1 and 160 printable characters.`,
    );
  }
  return value.trim();
}
export function normalizeIdentityEmail(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error(
      'email must be a valid address with at most 254 characters.',
    );
  const email = value.trim().toLowerCase();
  const [local, domain, extra] = email.split('@');
  if (
    email.length > 254 ||
    !local ||
    local.length > 64 ||
    !domain ||
    extra !== undefined ||
    /\s/u.test(email) ||
    hasControlCharacters(email) ||
    !domain.includes('.') ||
    domain
      .split('.')
      .some((label) => !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/u.test(label))
  ) {
    throw new Error(
      'email must be a valid address with at most 254 characters.',
    );
  }
  return email;
}
export function validateNewPassword(value: unknown): string {
  if (
    typeof value !== 'string' ||
    Array.from(value).length < 15 ||
    Array.from(value).length > 128
  ) {
    throw new Error('password must contain between 15 and 128 characters.');
  }
  return value;
}
