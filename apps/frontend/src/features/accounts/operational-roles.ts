import type { OperationalRole } from './accounts.types';
export const operationalRoles: readonly OperationalRole[] = [
  'psychologist',
  'assistant',
  'degree_student',
];
export function selectedRoles(data: FormData): OperationalRole[] {
  return operationalRoles.filter((role) =>
    data.getAll('roleCodes').includes(role),
  );
}
