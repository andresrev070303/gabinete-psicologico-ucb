import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  getAuditActionLabel,
  getAuditFieldLabel,
  getRoleSummary,
  getUserError,
} from './presentation';

describe('Spanish presentation', () => {
  it('labels existing role codes without changing the identity contract', () => {
    expect(getRoleSummary(['assistant', 'degree_student'])).toBe(
      'Auxiliar / pasante, Tesista',
    );
    expect(getRoleSummary([])).toBe('Sin perfil asignado');
  });
  it('uses Bolivian time regardless of the browser timezone', () => {
    expect(formatDateTime('2026-11-27T02:30:00Z')).toBe(
      new Intl.DateTimeFormat('es-BO', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/La_Paz',
      }).format(new Date('2026-11-27T02:30:00Z')),
    );
    expect(formatDateTime('invalid')).toBe('Fecha no disponible');
  });
  it('translates network failures without exposing raw browser errors', () => {
    expect(getUserError(new TypeError('Failed to fetch'))).toContain(
      'Comprueba tu conexión',
    );
    expect(getUserError(new DOMException('timeout', 'TimeoutError'))).toContain(
      'tardó demasiado',
    );
  });
  it('translates scoped audit operations and field names', () => {
    expect(getAuditActionLabel('identity.profile_updated')).toBe(
      'Actualización de perfil',
    );
    expect(getAuditActionLabel('iam.account.UPDATE')).toBe(
      'Actualización de registro',
    );
    expect(getAuditFieldLabel('given_names')).toBe('nombres');
  });
});
