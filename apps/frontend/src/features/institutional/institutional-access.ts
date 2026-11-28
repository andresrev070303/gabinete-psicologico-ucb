type Identity = Readonly<{
  roles: readonly string[];
  permissions: readonly string[];
}>;
export const canManageInstitutional = (identity: Identity) =>
  identity.roles.includes('director') &&
  identity.permissions.includes('institutional.manage');
export const canReadInstitutional = (identity: Identity) =>
  canManageInstitutional(identity) ||
  (identity.roles.some((role) =>
    ['psychologist', 'assistant', 'degree_student'].includes(role),
  ) &&
    identity.permissions.includes('institutional.read_assigned'));
