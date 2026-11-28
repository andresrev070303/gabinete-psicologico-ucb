import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAsyncResource, useAsyncMutation } from '../../lib/useAsyncResource';
import {
  createRecord,
  updateRecord,
  getInstitutionalCatalog,
  createInstitution,
} from './institutional.api';
import {
  kindForType,
  scheduledDuration,
  typeLabels,
} from './institutional.presentation';
import { InstitutionalTeamPicker } from './InstitutionalTeamPicker';
import { ScheduleFields } from './ScheduleFields';
import { readSchedule, serializeSchedule } from './institutional.schedule';
import type {
  RecordDetails,
  RecordDraft,
  RecordType,
  TeamMember,
} from './institutional.types';

export function RecordDialog({
  details,
  accountId,
  onSaved,
  onClose,
}: {
  details?: RecordDetails;
  accountId: string;
  onSaved: (details: RecordDetails) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useId();
  const current = details?.record;
  const [type, setType] = useState<RecordType>(current?.type ?? 'workshop');
  const kind = kindForType(type);
  const [title, setTitle] = useState(current?.title ?? ''),
    [description, setDescription] = useState(current?.description ?? '');
  const [start, setStart] = useState(
      readSchedule(current?.startsAt ?? null, kind),
    ),
    [end, setEnd] = useState(readSchedule(current?.endsAt ?? null, kind));
  const [institutionId, setInstitutionId] = useState(
      current?.institutionId ?? '',
    ),
    [responsible, setResponsible] = useState(
      current?.responsibleAccountId ?? accountId,
    );
  const [members, setMembers] = useState<readonly string[]>(
    details?.team.map((member) => member.accountId) ?? [],
  );
  const [projectId, setProjectId] = useState(current?.projectId ?? ''),
    [agreementId, setAgreementId] = useState(current?.agreementId ?? '');
  const [newInstitution, setNewInstitution] = useState(false);
  const [institutionRequestId, setInstitutionRequestId] = useState(() =>
    crypto.randomUUID(),
  );
  const [linksOpen, setLinksOpen] = useState(
    !!(current?.projectId || current?.agreementId),
  );
  const [institutionName, setInstitutionName] = useState(''),
    [institutionKind, setInstitutionKind] = useState('school');
  const [ids] = useState(() => ({
    record: crypto.randomUUID(),
  }));
  const action = useAsyncMutation();
  const loader = useCallback(
    (signal: AbortSignal) => getInstitutionalCatalog(signal),
    [],
  );
  const catalog = useAsyncResource(loader);
  const people: TeamMember[] = [...(catalog.data?.people ?? [])];
  for (const person of details?.team ?? [])
    if (!people.some((item) => item.accountId === person.accountId))
      people.push(person);
  const selectedAgreement = catalog.data?.agreements.find(
    (item) => item.id === agreementId,
  );
  const blocked = action.busy || catalog.busy || !catalog.data;
  const serializedStart = serializeSchedule(start, kind);
  const serializedEnd = serializeSchedule(end, kind);
  const duration =
    kind === 'activity'
      ? scheduledDuration(serializedStart, serializedEnd)
      : null;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);
  function changeType(next: RecordType) {
    const nextKind = kindForType(next);
    if (nextKind !== kind) {
      setStart(readSchedule(null, nextKind));
      setEnd(readSchedule(null, nextKind));
      setProjectId('');
      setAgreementId('');
    }
    setType(next);
  }
  async function addInstitution() {
    if (institutionName.trim().length < 3) return;
    await action.run(
      (signal) =>
        createInstitution(
          {
            id: institutionRequestId,
            name: institutionName.trim(),
            kind: institutionKind,
          },
          signal,
        ),
      async (saved) => {
        setInstitutionId(saved.id);
        setNewInstitution(false);
        setInstitutionName('');
        setInstitutionRequestId(crypto.randomUUID());
        await catalog.refresh();
      },
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || newInstitution) return;
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    const data = new FormData(event.currentTarget);
    const input: RecordDraft = {
      kind,
      type,
      title: title.trim(),
      description: description.trim() || null,
      startsAt: serializedStart,
      endsAt: serializedEnd,
      institutionId: institutionId || null,
      responsibleAccountId: responsible,
      memberAccountIds: members,
      projectId: kind === 'activity' ? projectId || null : null,
      agreementId: kind === 'activity' ? agreementId || null : null,
      code:
        kind === 'activity'
          ? null
          : String(data.get('code') ?? '').trim() || null,
      venue:
        kind === 'activity'
          ? String(data.get('venue') ?? '').trim() || null
          : null,
    };
    await action.run(
      (signal) =>
        current
          ? updateRecord(
              current,
              { ...input, version: current.version },
              signal,
            )
          : createRecord({ ...input, id: ids.record }, signal),
      onSaved,
    );
  }
  return (
    <dialog
      ref={dialog}
      className="institutional-dialog"
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        if (!action.busy) onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">GESTIÓN INSTITUCIONAL</span>
          <h2 id={heading}>{current ? 'Editar registro' : 'Crear registro'}</h2>
        </div>
        <button
          type="button"
          aria-label="Cerrar formulario"
          disabled={action.busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <form
        aria-label="Datos del registro institucional"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        {catalog.busy && <p role="status">Cargando opciones…</p>}
        {catalog.error && (
          <p role="alert">
            {catalog.error}
            <button
              type="button"
              onClick={() => {
                void catalog.refresh();
              }}
            >
              Reintentar
            </button>
          </p>
        )}
        {action.error && (
          <p className="feedback" role="alert">
            {action.error}
          </p>
        )}
        <label>
          ¿Qué quieres registrar?
          <select
            value={type}
            disabled={blocked}
            onChange={(event) => changeType(event.target.value as RecordType)}
          >
            {Object.entries(typeLabels)
              .filter(
                ([value]) =>
                  !current || kindForType(value as RecordType) === current.kind,
              )
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label>
          Nombre
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            minLength={3}
            maxLength={180}
            disabled={blocked}
          />
        </label>
        <label>
          {kind === 'agreement'
            ? 'Descripción del acuerdo'
            : 'Descripción u objetivo'}
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={4000}
            rows={3}
            disabled={blocked}
          />
        </label>
        {kind === 'activity' ? (
          <div className="institutional-schedule-fields">
            <ScheduleFields
              label="Inicio"
              value={start}
              required
              disabled={blocked}
              onChange={setStart}
            />
            <ScheduleFields
              label="Fin"
              value={end}
              disabled={blocked}
              minDate={start.date}
              onChange={setEnd}
            />
          </div>
        ) : (
          <div className="institutional-form-grid">
            <label>
              Inicio de vigencia
              <input
                type="date"
                value={start.date}
                disabled={blocked}
                onChange={(event) =>
                  setStart({ ...start, date: event.target.value })
                }
              />
            </label>
            <label>
              Fin de vigencia (opcional)
              <input
                type="date"
                value={end.date}
                min={start.date || undefined}
                disabled={blocked}
                onChange={(event) =>
                  setEnd({ ...end, date: event.target.value })
                }
              />
            </label>
          </div>
        )}
        {kind === 'activity' && (
          <p className="institutional-help">
            Horario de Bolivia
            {duration ? ` · Duración programada: ${duration}` : ''}
            <br />
            Formato de 24 horas: por ejemplo, 09:00 o 15:00. Puedes escribir
            1500 para obtener 15:00.
          </p>
        )}
        {kind === 'activity' ? (
          <label>
            Lugar
            <input
              name="venue"
              defaultValue={current?.venue ?? ''}
              maxLength={160}
              disabled={blocked}
            />
          </label>
        ) : (
          <label>
            Código (opcional)
            <input
              name="code"
              defaultValue={current?.code ?? ''}
              maxLength={60}
              disabled={blocked}
            />
          </label>
        )}
        <label>
          Institución{kind !== 'agreement' ? ' (opcional)' : ''}
          <select
            value={institutionId}
            required={kind === 'agreement'}
            disabled={blocked || !!selectedAgreement}
            onChange={(event) => setInstitutionId(event.target.value)}
          >
            <option value="">
              {kind === 'agreement'
                ? 'Seleccionar institución'
                : 'Sin institución vinculada'}
            </option>
            {catalog.data?.institutions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {!selectedAgreement && (
          <button
            type="button"
            className="institutional-text-button"
            disabled={blocked}
            onClick={() => setNewInstitution((previous) => !previous)}
          >
            {newInstitution
              ? 'Cancelar nueva institución'
              : '+ Añadir institución'}
          </button>
        )}
        {newInstitution && (
          <fieldset className="institutional-inline-form">
            <legend>Nueva institución</legend>
            <label>
              Nombre de la institución
              <input
                value={institutionName}
                onChange={(event) => setInstitutionName(event.target.value)}
                minLength={3}
                maxLength={200}
                disabled={action.busy}
              />
            </label>
            <label>
              Tipo de institución
              <select
                value={institutionKind}
                onChange={(event) => setInstitutionKind(event.target.value)}
                disabled={action.busy}
              >
                {[
                  ['school', 'Colegio'],
                  ['university', 'Universidad'],
                  ['ucb_unit', 'Unidad UCB'],
                  ['company', 'Empresa'],
                  ['ngo', 'ONG'],
                  ['public', 'Institución pública'],
                  ['other', 'Otra'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={action.busy || institutionName.trim().length < 3}
              onClick={() => {
                void addInstitution();
              }}
            >
              Guardar institución
            </button>
          </fieldset>
        )}
        <label>
          Responsable
          <select
            value={responsible}
            required
            disabled={blocked}
            onChange={(event) => setResponsible(event.target.value)}
          >
            <option value="">Seleccionar responsable</option>
            {catalog.data?.people
              .filter((person) =>
                person.roles.some(
                  (role) => role === 'director' || role === 'psychologist',
                ),
              )
              .map((person) => (
                <option key={person.accountId} value={person.accountId}>
                  {person.name}
                </option>
              ))}
          </select>
        </label>
        <InstitutionalTeamPicker
          people={people}
          responsibleAccountId={responsible}
          selected={members}
          disabled={blocked}
          onChange={setMembers}
        />

        {kind === 'activity' && (
          <details
            className="institutional-links"
            open={linksOpen}
            onToggle={(event) => setLinksOpen(event.currentTarget.open)}
          >
            <summary>Vincular con un proyecto o convenio (opcional)</summary>
            <label>
              Proyecto
              <select
                value={projectId}
                disabled={blocked}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">Sin proyecto</option>
                {catalog.data?.projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Convenio
              <select
                value={agreementId}
                disabled={blocked}
                onChange={(event) => {
                  setAgreementId(event.target.value);
                  const agreement = catalog.data?.agreements.find(
                    (item) => item.id === event.target.value,
                  );
                  if (agreement?.institutionId)
                    setInstitutionId(agreement.institutionId);
                }}
              >
                <option value="">Sin convenio</option>
                {catalog.data?.agreements.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          </details>
        )}
        <footer>
          <button type="button" disabled={action.busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={blocked || newInstitution}
          >
            {action.busy
              ? 'Guardando…'
              : current
                ? 'Guardar cambios'
                : 'Crear registro'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
