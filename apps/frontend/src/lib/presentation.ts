const roleLabels: Readonly<Record<string, string>> = {
  administrator: 'Administrador',
  director: 'Director',
  psychologist: 'Psicólogo',
  assistant: 'Auxiliar / pasante',
  degree_student: 'Tesista',
};
const statusLabels: Readonly<Record<string, string>> = {
  active: 'Activa',
  invited: 'Invitación pendiente',
  disabled: 'Desactivada',
  locked: 'Bloqueada',
};
export function getRoleLabel(role: string): string {
  return roleLabels[role] ?? 'Perfil sin identificar';
}
export function getRoleSummary(roles: readonly string[]): string {
  return roles.length
    ? roles.map(getRoleLabel).join(', ')
    : 'Sin perfil asignado';
}
export function getAccountStatusLabel(status: string): string {
  return statusLabels[status] ?? 'Estado sin identificar';
}
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/La_Paz',
  }).format(date);
}
export function getUserError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return 'La solicitud tardó demasiado. Intenta nuevamente.';
  if (error instanceof TypeError)
    return 'No pudimos conectar con el servicio. Comprueba tu conexión e intenta nuevamente.';
  if (error instanceof SyntaxError)
    return 'El servicio devolvió una respuesta inesperada. Intenta nuevamente.';
  return error instanceof Error
    ? error.message
    : 'No pudimos completar la operación. Intenta nuevamente.';
}
const auditActionLabels: Readonly<Record<string, string>> = {
  operational_invited: 'Invitación de cuenta',
  profile_updated: 'Actualización de perfil',
  roles_changed: 'Cambio de perfiles',
  account_disabled: 'Desactivación de cuenta',
  account_reinvited: 'Nueva invitación',
  password_reset_issued: 'Emisión de recuperación',
  account_activation: 'Activación de cuenta',
  password_reset: 'Restablecimiento de contraseña',
  session_revoked: 'Revocación de sesión',
  password_changed: 'Cambio de contraseña',
  password_change_failed: 'Cambio de contraseña rechazado',
  contact_updated: 'Actualización de contacto',
  sign_in_succeeded: 'Inicio de sesión',
  sign_out_succeeded: 'Cierre de sesión',
  director_assigned: 'Designación de Director',
  director_invited: 'Invitación de candidato a Director',
};
const auditFieldLabels: Readonly<Record<string, string>> = {
  given_names: 'nombres',
  family_names: 'apellidos',
  contact_phone: 'teléfono',
  email: 'correo',
  account_status: 'estado de la cuenta',
  password_hash: 'contraseña',
  role_id: 'perfil',
  revoked_at: 'fecha de revocación',
  active: 'estado activo',
  last_login_at: 'último ingreso',
  updated_at: 'actualización',
  created_at: 'creación',
  token_hash: 'credencial',
  expires_at: 'vencimiento',
  person_id: 'persona',
};
export function getAuditActionLabel(action: string): string {
  if (auditActionLabels[action]) return auditActionLabels[action];
  const operation = action.split('.').at(-1)?.toLowerCase();
  const labels: Readonly<Record<string, string>> = {
    insert: 'Creación de registro',
    update: 'Actualización de registro',
    delete: 'Eliminación de registro',
  };
  return (
    auditActionLabels[operation ?? ''] ??
    labels[operation ?? ''] ??
    'Cambio en un registro'
  );
}
export function getAuditFieldLabel(field: string): string {
  return auditFieldLabels[field] ?? 'Otro campo';
}
