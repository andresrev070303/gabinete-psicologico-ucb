import { useState } from 'react';
import type { TeamMember } from './institutional.types';

export function InstitutionalTeamPicker({
  people,
  responsibleAccountId,
  selected,
  disabled,
  onChange,
}: {
  people: readonly TeamMember[];
  responsibleAccountId: string;
  selected: readonly string[];
  disabled: boolean;
  onChange: (ids: readonly string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = people.filter((person) =>
    person.name
      .toLocaleLowerCase('es')
      .includes(search.toLocaleLowerCase('es')),
  );
  return (
    <fieldset className="institutional-team">
      <legend>Equipo participante</legend>
      <p className="institutional-help">
        El responsable forma parte del equipo. Las personas añadidas recibirán
        un aviso en su campana.
      </p>
      <label>
        Buscar persona
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={disabled}
        />
      </label>
      <div className="institutional-team-options">
        {filtered.map((person) => (
          <label key={person.accountId} className="institutional-member">
            <input
              type="checkbox"
              checked={
                person.accountId === responsibleAccountId ||
                selected.includes(person.accountId)
              }
              disabled={disabled || person.accountId === responsibleAccountId}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, person.accountId]
                    : selected.filter((id) => id !== person.accountId),
                )
              }
            />
            <span>{person.name}</span>
          </label>
        ))}
        {!filtered.length && <p>No hay personas con ese nombre.</p>}
      </div>
    </fieldset>
  );
}
