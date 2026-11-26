export const IDENTITY_PERMISSIONS = [
  { code: 'roles.read', description: 'Read the predefined role catalog.' },
  {
    code: 'accounts.read',
    description: 'Read identity metadata within the authorized account scope.',
  },
  {
    code: 'accounts.invite_director_candidate',
    description: 'Invite a candidate without granting the director role.',
  },
  {
    code: 'director.assign',
    description: 'Assign or replace the single active director.',
  },
  {
    code: 'director.disable',
    description: 'Disable the director account following an incident.',
  },
  {
    code: 'director.reinvite',
    description: 'Reinvite a disabled director account.',
  },
  {
    code: 'credentials.issue_director_reset',
    description: 'Issue a single-use director password reset invitation.',
  },
  {
    code: 'accounts.invite_operational',
    description: 'Invite an operational account with predefined roles.',
  },
  {
    code: 'accounts.update_operational',
    description:
      'Update the name and contact details of a manageable operational account.',
  },
  {
    code: 'roles.assign_operational',
    description: 'Grant a predefined operational role to a manageable account.',
  },
  {
    code: 'roles.revoke_operational',
    description: 'Revoke an operational role from a manageable account.',
  },
  {
    code: 'accounts.disable_operational',
    description: 'Disable a manageable operational account.',
  },
  {
    code: 'accounts.reinvite_operational',
    description:
      'Reinvite a disabled operational account with newly selected roles.',
  },
  {
    code: 'credentials.issue_operational_reset',
    description:
      'Issue a single-use password reset invitation for a manageable account.',
  },
  {
    code: 'audit.read_identity',
    description:
      'Read identity audit events within the authorized account scope.',
  },
] as const;

type IdentityPermissionCode = (typeof IDENTITY_PERMISSIONS)[number]['code'];
type IdentityRoleDefinition = Readonly<{
  code: string;
  label: string;
  description: string;
  permissions: readonly IdentityPermissionCode[];
}>;

export const OPERATIONAL_ROLE_CODES = [
  'psychologist',
  'assistant',
  'degree_student',
] as const;

/** Identity permissions only. Clinical access is defined by its own modules. */
export const IDENTITY_ROLES = [
  {
    code: 'administrator',
    label: 'Technical administrator',
    description:
      'Appoint the director and support recovery of director access.',
    permissions: [
      'roles.read',
      'accounts.read',
      'accounts.invite_director_candidate',
      'director.assign',
      'director.disable',
      'director.reinvite',
      'credentials.issue_director_reset',
      'audit.read_identity',
    ],
  },
  {
    code: 'director',
    label: 'Director',
    description:
      'Manage operational accounts within the psychology services office.',
    permissions: [
      'roles.read',
      'accounts.read',
      'accounts.invite_operational',
      'accounts.update_operational',
      'roles.assign_operational',
      'roles.revoke_operational',
      'accounts.disable_operational',
      'accounts.reinvite_operational',
      'credentials.issue_operational_reset',
      'audit.read_identity',
    ],
  },
  {
    code: 'psychologist',
    label: 'Psychologist',
    description: 'Contracted professional providing psychological services.',
    permissions: [],
  },
  {
    code: 'assistant',
    label: 'Student assistant',
    description:
      'Student performing guided practice in assigned service areas.',
    permissions: [],
  },
  {
    code: 'degree_student',
    label: 'Degree student',
    description:
      'Student carrying out approved degree objectives under supervision.',
    permissions: [],
  },
] as const satisfies readonly IdentityRoleDefinition[];
