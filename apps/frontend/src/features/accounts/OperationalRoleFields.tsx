import { operationalRoles } from './operational-roles';
import { getRoleLabel } from '../../lib/presentation';
export function OperationalRoleFields({
  roles = ['psychologist'],
  disabled = false,
}: {
  roles?: readonly string[];
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Perfiles operativos</legend>
      {operationalRoles.map((role) => (
        <label key={role}>
          <input
            type="checkbox"
            name="roleCodes"
            value={role}
            defaultChecked={roles.includes(role)}
          />
          {getRoleLabel(role)}
        </label>
      ))}
    </fieldset>
  );
}
