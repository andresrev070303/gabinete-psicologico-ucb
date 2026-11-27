import { operationalRoles } from './operational-roles';
const labels = {
  psychologist: 'Psychologist',
  assistant: 'Student assistant',
  degree_student: 'Degree student',
};
export function OperationalRoleFields({
  roles = ['psychologist'],
  disabled = false,
}: {
  roles?: readonly string[];
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Operational roles</legend>
      {operationalRoles.map((role) => (
        <label key={role}>
          <input
            type="checkbox"
            name="roleCodes"
            value={role}
            defaultChecked={roles.includes(role)}
          />
          {labels[role]}
        </label>
      ))}
    </fieldset>
  );
}
