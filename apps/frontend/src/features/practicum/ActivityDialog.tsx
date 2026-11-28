import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createPlacement,
  createTask,
  editEntry,
  getCatalog,
  listTasks,
  startTimer,
} from './practicum.api';
import {
  usePracticumMutation,
  usePracticumResource,
} from './usePracticumResource';
import { ActivityCombobox } from './ActivityCombobox';
import type { Placement, PracticeTask, TimeEntry } from './practicum.types';

const normalized = (value: string) => value.trim().toLocaleLowerCase('es');

async function loadActivities(placementId: string, signal: AbortSignal) {
  const tasks: PracticeTask[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await listTasks(placementId, cursor, signal);
    tasks.push(...page.items.filter((task) => task.status === 'active'));
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor))
      throw new Error('No pudimos cargar las actividades. Intenta nuevamente.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return tasks;
}

export function ActivityDialog({
  mode,
  placement,
  initialTask,
  entry,
  timerRunning = false,
  onSaved,
  onClose,
}: {
  mode: 'own' | 'assign' | 'edit';
  entry?: TimeEntry;
  placement?: Placement;
  initialTask?: PracticeTask;
  timerRunning?: boolean;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [recipientId, setRecipientId] = useState(
    placement?.studentAccountId ?? '',
  );
  const [project, setProject] = useState(
    entry?.projectLabel ?? initialTask?.projectLabel ?? '',
  );
  const [activity, setActivity] = useState(
    entry?.taskTitle ?? initialTask?.title ?? '',
  );
  const [description, setDescription] = useState(
    entry?.description ?? initialTask?.description ?? '',
  );
  const [ids] = useState(() => ({
    task: crypto.randomUUID(),
    entry: crypto.randomUUID(),
  }));
  const action = usePracticumMutation();
  const loadRecipients = useCallback(
    (signal: AbortSignal) => getCatalog(signal),
    [],
  );
  const recipients = usePracticumResource(loadRecipients, mode === 'assign');
  const load = useCallback(
    async (signal: AbortSignal) => {
      const target =
        placement?.studentAccountId === recipientId
          ? placement
          : mode === 'assign'
            ? await createPlacement({ studentAccountId: recipientId }, signal)
            : null;
      if (!target)
        throw new Error(
          'No pudimos preparar tus actividades. Actualiza la página.',
        );
      return {
        placement: target,
        tasks: await loadActivities(target.id, signal),
      };
    },
    [placement, recipientId, mode],
  );
  const options = usePracticumResource(load, !!recipientId);
  const ready =
    options.data?.placement.studentAccountId === recipientId
      ? options.data
      : null;
  const tasks = ready?.tasks ?? [];
  const matches = (task: PracticeTask) =>
    normalized(task.projectLabel) === normalized(project) &&
    normalized(task.title) === normalized(activity);
  const selected =
    tasks.find((task) => task.assignedByDirector && matches(task)) ??
    tasks.find(matches);
  const projects = [...new Set(tasks.map((task) => task.projectLabel))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  );
  const activities = tasks.filter(
    (task) => normalized(task.projectLabel) === normalized(project),
  );
  const activityNames = [...new Set(activities.map((task) => task.title))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  );
  const blocked = action.busy || options.busy || !ready;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);

  function chooseActivity(value: string) {
    setActivity(value);
    const match = tasks.find(
      (task) =>
        normalized(task.projectLabel) === normalized(project) &&
        normalized(task.title) === normalized(value),
    );
    if (match) setDescription(match.description ?? '');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || blocked || (mode === 'own' && timerRunning)) return;
    await action.run(async (signal) => {
      if (mode === 'edit' && entry) {
        await editEntry(
          entry.id,
          {
            title: activity.trim(),
            projectLabel: project.trim(),
            description: description.trim() || null,
            version: entry.version,
          },
          signal,
        );
      } else if (mode === 'own' && selected) {
        await startTimer(
          ready.placement.id,
          {
            id: ids.entry,
            taskId: selected.id,
            description: description.trim() || null,
          },
          signal,
        );
      } else {
        await createTask(
          ready.placement.id,
          {
            id: ids.task,
            title: activity.trim(),
            projectLabel: project.trim(),
            activityKind: 'other',
            description: description.trim() || null,
            startTimer: mode === 'own',
            entryId: mode === 'own' ? ids.entry : null,
          },
          signal,
        );
      }
    }, onSaved);
  }
  return (
    <dialog
      ref={dialog}
      className="practice-dialog"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        if (!action.busy) onClose();
      }}
    >
      <header className="practice-dialog-header">
        <h2 id={headingId}>
          {mode === 'edit'
            ? 'Editar registro'
            : mode === 'assign'
              ? 'Asignar actividad'
              : 'Crear actividad'}
        </h2>
        <button
          type="button"
          aria-label="Cerrar actividad"
          disabled={action.busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <form
        className="practice-dialog-form"
        aria-label="Datos de la actividad"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        {action.error && <p role="alert">{action.error}</p>}
        {mode === 'assign' && (
          <label>
            Practicante
            <select
              required
              value={recipientId}
              disabled={action.busy || recipients.busy}
              onChange={(event) => {
                setRecipientId(event.target.value);
                setProject('');
                setActivity('');
                setDescription('');
              }}
            >
              <option value="">Seleccionar practicante</option>
              {placement &&
                !recipients.data?.students.some(
                  (student) => student.id === placement.studentAccountId,
                ) && (
                  <option value={placement.studentAccountId}>
                    {placement.studentName}
                  </option>
                )}
              {recipients.data?.students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {student.email}
                </option>
              ))}
            </select>
          </label>
        )}
        {recipients.error && (
          <p role="alert">
            {recipients.error}
            <button
              type="button"
              onClick={() => {
                void recipients.refresh();
              }}
            >
              Reintentar practicantes
            </button>
          </p>
        )}
        {options.busy && <p role="status">Cargando proyectos y actividades…</p>}
        {options.error && (
          <p role="alert">
            {options.error}
            <button
              type="button"
              onClick={() => {
                void options.refresh();
              }}
            >
              Reintentar actividades
            </button>
          </p>
        )}
        <ActivityCombobox
          label="Proyecto"
          value={project}
          options={projects.map((value) => ({ value }))}
          disabled={blocked}
          placeholder="Selecciona o escribe un proyecto"
          onChange={(value) => {
            setProject(value);
            setActivity('');
            setDescription('');
          }}
        />
        <ActivityCombobox
          label="Actividad"
          value={activity}
          minLength={3}
          options={activityNames.map((value) => ({
            value,
            detail: activities.some(
              (task) => task.title === value && task.assignedByDirector,
            )
              ? 'Asignada por el Director'
              : undefined,
          }))}
          disabled={blocked}
          placeholder="Selecciona o escribe una actividad"
          onChange={chooseActivity}
        />
        {mode === 'own' && selected?.assignedByDirector && (
          <p className="practice-assigned-label">
            Actividad asignada por el Director
          </p>
        )}
        <label>
          Descripción
          <textarea
            name="description"
            value={description}
            maxLength={2000}
            rows={4}
            disabled={blocked}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <p className="practice-help">
          Puedes elegir una opción existente o escribir una nueva. Describe el
          trabajo sin incluir información clínica identificable.
        </p>
        {mode === 'own' && timerRunning && (
          <p role="status">
            Detén el cronómetro actual antes de iniciar otra actividad.
          </p>
        )}
        <footer className="practice-dialog-footer">
          <button type="button" disabled={action.busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={
              blocked ||
              (mode === 'own' && timerRunning) ||
              (mode !== 'edit' && ready?.placement.status !== 'active')
            }
          >
            {action.busy
              ? 'Guardando…'
              : mode === 'edit'
                ? 'Guardar cambios'
                : mode === 'assign'
                  ? 'Asignar actividad'
                  : 'Guardar e iniciar'}
          </button>
        </footer>
        {mode !== 'edit' && ready?.placement.status === 'completed' && (
          <p role="status">
            Esta práctica está finalizada. Conserva sus horas; el Director puede
            reabrirla para registrar trabajo nuevo.
          </p>
        )}
      </form>
    </dialog>
  );
}
