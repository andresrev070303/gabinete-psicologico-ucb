// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticumPersonalPanel } from './PracticumPersonalPanel';
import { PracticumManagementPanel } from './PracticumManagementPanel';
import { PracticumTimerBar, PracticumTimerProvider } from './PracticumTimer';
import { PlacementForms } from './PlacementForms';
import type { Placement, PracticeTask, TimeEntry } from './practicum.types';

const student = {
  accountId: 'student',
  givenNames: 'Test',
  familyNames: 'Student',
  email: 'student@example.test',
  roles: ['degree_student'],
  permissions: ['practicum.read_own', 'practicum.track_own'],
};
const director = {
  ...student,
  accountId: 'director',
  roles: ['director'],
  permissions: ['practicum.manage'],
};
const profile: Placement = {
  id: 'placement',
  studentAccountId: 'student',
  studentName: 'Test Student',
  studentEmail: student.email,
  status: 'active',
  version: 1,
  totalSeconds: 5700,
  entryCount: 1,
  hasRunningTimer: false,
};
const assigned: PracticeTask = {
  id: 'assigned',
  placementId: profile.id,
  title: 'Digitalizar registros',
  projectLabel: 'Apoyo administrativo',
  activityKind: 'other',
  description: 'Actividad preparada por Dirección',
  status: 'active',
  version: 1,
  assignedByDirector: true,
  createdByAccountId: 'director',
};
const entry: TimeEntry = {
  id: 'entry',
  placementId: profile.id,
  taskId: assigned.id,
  taskTitle: assigned.title,
  projectLabel: assigned.projectLabel,
  activityKind: 'other',
  description: 'Trabajo anterior',
  startedAt: '2026-11-27T13:00:00Z',
  endedAt: '2026-11-27T14:35:00Z',
  durationSeconds: 5700,
  source: 'manual',
  version: 1,
  voidedAt: null,
};
const serverNow = '2026-11-27T15:00:00Z';

describe('Independent practice activities', () => {
  const fetcher = vi.fn<typeof fetch>();
  let running: TimeEntry | null;
  let tasks: PracticeTask[];
  let hasProfile: boolean;
  let status: Placement['status'];
  let failure: boolean;
  let paginated: boolean;
  let records: TimeEntry[];
  beforeEach(() => {
    running = null;
    tasks = [assigned];
    hasProfile = false;
    status = 'active';
    failure = false;
    paginated = false;
    records = [entry];
    fetcher.mockReset().mockImplementation(async (input, options) => {
      const url = new URL(String(input));
      const path = url.pathname;
      const method = options?.method ?? 'GET';
      const current = {
        ...profile,
        status,
        totalSeconds: records.reduce(
          (total, item) =>
            total + (item.voidedAt ? 0 : (item.durationSeconds ?? 0)),
          0,
        ),
        entryCount: records.length,
      };
      if (path.endsWith('/my-placement')) {
        hasProfile = true;
        return Response.json(current);
      }
      if (path.endsWith('/my-placements'))
        return Response.json({
          items: hasProfile ? [current] : [],
          nextCursor: null,
        });
      if (path.endsWith('/practitioners'))
        return Response.json({
          items: [{ ...current, placementId: hasProfile ? profile.id : null }],
          nextCursor: null,
        });
      if (path.endsWith('/catalog'))
        return Response.json({
          students: [
            { id: 'student', name: 'Test Student', email: student.email },
          ],
        });
      if (path.endsWith('/placements') && method === 'POST') {
        hasProfile = true;
        return Response.json(current);
      }
      if (path.endsWith('/placements'))
        return Response.json({ items: [current], nextCursor: null });
      if (path.endsWith('/placement') && method === 'PATCH') {
        status = JSON.parse(options!.body as string).status;
        return Response.json({ ...current, status, version: 2 });
      }
      if (path.endsWith('/placement')) return Response.json(current);
      if (path.endsWith('/running-timer'))
        return Response.json({ entry: running, serverNow });
      if (path.endsWith('/tasks') && method === 'POST') {
        if (failure)
          return Response.json({ code: 'timer_running' }, { status: 409 });
        const body = JSON.parse(options!.body as string);
        const task = {
          ...assigned,
          id: body.id,
          title: body.title,
          projectLabel: body.projectLabel,
          description: body.description,
          assignedByDirector: !body.startTimer,
          createdByAccountId: body.startTimer ? 'student' : 'director',
        };
        tasks.push(task);
        if (body.startTimer)
          running = {
            ...entry,
            id: body.entryId,
            taskId: body.id,
            taskTitle: body.title,
            projectLabel: body.projectLabel,
            description: body.description,
            endedAt: null,
            durationSeconds: null,
            source: 'timer',
          };
        return Response.json({
          task,
          timer: body.startTimer ? running : null,
          serverNow,
        });
      }
      if (path.endsWith('/tasks'))
        return Response.json(
          paginated && !url.searchParams.has('cursor')
            ? { items: [], nextCursor: 'next' }
            : { items: tasks, nextCursor: null },
        );
      if (path.endsWith('/timer')) {
        const body = JSON.parse(options!.body as string);
        running = {
          ...entry,
          id: body.id,
          taskId: body.taskId,
          description: body.description,
          endedAt: null,
          durationSeconds: null,
          source: 'timer',
        };
        return Response.json({ entry: running, serverNow });
      }
      if (path.endsWith('/stop')) {
        const stopped = {
          ...running!,
          endedAt: serverNow,
          durationSeconds: 3600,
          version: 2,
        };
        running = null;
        return Response.json(stopped);
      }
      if (path.endsWith('/entries') && method === 'POST')
        return Response.json(entry);
      if (path.endsWith('/entries'))
        return Response.json({
          items: (running ? [running, ...records] : records).filter(
            (item) => !item.voidedAt,
          ),
          nextCursor: null,
          totalSeconds: current.totalSeconds,
          entryCount: current.entryCount,
          serverNow,
        });
      if (path.endsWith('/void')) {
        records = records.map((item) =>
          item.id === entry.id
            ? { ...item, voidedAt: serverNow, version: 2 }
            : item,
        );
        return Response.json(records.find((item) => item.id === entry.id));
      }
      if (path.endsWith('/entry') && method === 'PATCH') {
        const body = JSON.parse(options!.body as string);
        records = records.map((item) =>
          item.id === entry.id
            ? {
                ...item,
                taskTitle: body.title,
                projectLabel: body.projectLabel,
                description: body.description,
                version: item.version + 1,
              }
            : item,
        );
        return Response.json(records.find((item) => item.id === entry.id));
      }
      if (path.endsWith('/resume')) {
        const body = JSON.parse(options!.body as string);
        running = {
          ...records[0],
          id: body.id,
          startedAt: serverNow,
          endedAt: null,
          durationSeconds: null,
          source: 'timer',
        };
        return Response.json({ entry: running, serverNow });
      }
      throw new Error('Unexpected test route: ' + path);
    });
    vi.stubGlobal('fetch', fetcher);
    vi.stubEnv('VITE_API_URL', '/api');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  function renderOwn() {
    return render(
      <PracticumTimerProvider identity={student}>
        <PracticumTimerBar />
        <PracticumPersonalPanel identity={student} view="hours" />
      </PracticumTimerProvider>,
    );
  }
  function callsTo(path: string, method = 'POST') {
    return fetcher.mock.calls.filter(
      ([input, options]) =>
        new URL(String(input)).pathname.endsWith(path) &&
        (options?.method ?? 'GET') === method,
    );
  }
  function fill(project: string, activity: string, description: string) {
    fireEvent.change(screen.getByLabelText('Proyecto'), {
      target: { value: project },
    });
    fireEvent.change(screen.getByLabelText('Actividad'), {
      target: { value: activity },
    });
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: description },
    });
  }
  async function openRecords() {
    fireEvent.click(
      await screen.findByRole('tab', { name: 'Registro de horas' }),
    );
    return screen.findByRole('table');
  }
  async function openCreate() {
    fireEvent.click(await screen.findByRole('button', { name: 'Crear' }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Proyecto') as HTMLInputElement).disabled,
      ).toBe(false),
    );
  }

  it('opens an empty time space without prior director registration or a supervisor', async () => {
    records = [];
    renderOwn();
    await screen.findByRole('button', { name: 'Crear' });
    expect(callsTo('/my-placement')).toHaveLength(1);
    expect(JSON.parse(callsTo('/my-placement')[0][1]!.body as string)).toEqual(
      {},
    );
    expect(callsTo('/placements')).toHaveLength(0);
    expect(
      screen.queryByText('Aún no tienes una práctica registrada'),
    ).toBeNull();
    expect(screen.queryByText('Supervisor')).toBeNull();
    await openRecords();
    expect(
      await screen.findByText(
        'Todavía no hay horas registradas en esta práctica.',
      ),
    ).toBeDefined();
  });
  it('uses the same three-field modal from Create and Play', async () => {
    renderOwn();
    await openCreate();
    expect(
      screen.getByRole('dialog', { name: 'Crear actividad' }),
    ).toBeDefined();
    expect(screen.getByLabelText('Proyecto')).toBeDefined();
    expect(screen.getByLabelText('Actividad')).toBeDefined();
    expect(screen.getByLabelText('Descripción')).toBeDefined();
    for (const label of [
      'Practicante',
      'Supervisor',
      'Encargado',
      'Título de la tarea',
      'Etiquetas',
    ])
      expect(screen.queryByLabelText(label)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar actividad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar cronómetro' }));
    expect(
      screen.getByRole('dialog', { name: 'Crear actividad' }),
    ).toBeDefined();
  });
  it('creates a personal project and activity and starts time without approval', async () => {
    renderOwn();
    await openCreate();
    fill(
      'Organización interna',
      'Ordenar documentos',
      'Preparar archivo administrativo',
    );
    fireEvent.submit(
      screen.getByRole('form', { name: 'Datos de la actividad' }),
    );
    await screen.findByRole('region', { name: 'Cronómetro de práctica' });
    const body = JSON.parse(callsTo('/tasks')[0][1]!.body as string);
    expect(body).toMatchObject({
      title: 'Ordenar documentos',
      projectLabel: 'Organización interna',
      description: 'Preparar archivo administrativo',
      startTimer: true,
      activityKind: 'other',
    });
    for (const key of [
      'studentAccountId',
      'supervisorAccountId',
      'actorAccountId',
      'sessionId',
      'approved',
    ])
      expect(body).not.toHaveProperty(key);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      within(await openRecords()).getByText('Trabajo anterior'),
    ).toBeDefined();
  });
  it('offers assigned activities filtered by project and resumes one without duplicating its definition', async () => {
    paginated = true;
    renderOwn();
    await openCreate();
    fireEvent.click(
      screen.getByRole('button', { name: 'Mostrar opciones de proyecto' }),
    );
    fireEvent.click(
      screen.getByRole('option', { name: assigned.projectLabel }),
    );
    fireEvent.change(screen.getByLabelText('Proyecto'), {
      target: { value: assigned.projectLabel },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Mostrar opciones de actividad' }),
    );
    fireEvent.click(
      screen.getByRole('option', { name: /Digitalizar registros/u }),
    );
    fireEvent.change(screen.getByLabelText('Actividad'), {
      target: { value: assigned.title },
    });
    expect(
      (screen.getByLabelText('Descripción') as HTMLTextAreaElement).value,
    ).toBe(assigned.description);
    expect(
      screen.getByText('Actividad asignada por el Director'),
    ).toBeDefined();
    fireEvent.submit(
      screen.getByRole('form', { name: 'Datos de la actividad' }),
    );
    await screen.findByRole('region', { name: 'Cronómetro de práctica' });
    expect(callsTo('/tasks')).toHaveLength(0);
    expect(JSON.parse(callsTo('/timer')[0][1]!.body as string)).toMatchObject({
      taskId: assigned.id,
      id: expect.any(String),
    });
  });
  it('keeps input and shows the safe failure when starting conflicts', async () => {
    failure = true;
    renderOwn();
    await openCreate();
    fill('Proyecto nuevo', 'Nueva actividad', 'Conservar esta descripción');
    fireEvent.submit(
      screen.getByRole('form', { name: 'Datos de la actividad' }),
    );
    await screen.findByRole('alert');
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(
      (screen.getByLabelText('Descripción') as HTMLTextAreaElement).value,
    ).toBe('Conservar esta descripción');
  });
  it('lists a practitioner before their first time record and lets the director view their hours', async () => {
    render(<PracticumManagementPanel identity={director} />);
    expect(await screen.findByText('Test Student')).toBeDefined();
    expect(
      screen.queryByRole('button', { name: 'Agregar practicante' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver horas' }));
    await screen.findByRole('table');
    expect(JSON.parse(callsTo('/placements')[0][1]!.body as string)).toEqual({
      studentAccountId: 'student',
    });
    expect(await screen.findByText('01:35:00')).toBeDefined();
    for (const name of [
      'Eliminar',
      'Editar',
      'Retomar',
      'Ver actividades',
      'Asignar actividad',
    ])
      expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
  it('lets the director assign with the same project, activity and description form plus recipient only', async () => {
    render(<PracticumManagementPanel identity={director} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Crear actividad' }),
    );
    await screen.findByRole('option', { name: /Test Student/u });
    fireEvent.change(screen.getByLabelText('Practicante'), {
      target: { value: 'student' },
    });
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Proyecto') as HTMLInputElement).disabled,
      ).toBe(false),
    );
    fill(
      'Taller comunitario',
      'Preparar materiales',
      'Actividad asignada para el taller',
    );
    fireEvent.submit(
      screen.getByRole('form', { name: 'Datos de la actividad' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(JSON.parse(callsTo('/tasks')[0][1]!.body as string)).toMatchObject({
      title: 'Preparar materiales',
      startTimer: false,
      entryId: null,
    });
    expect(callsTo('/timer')).toHaveLength(0);
    expect(screen.queryByLabelText('Supervisor')).toBeNull();
  });
  it('does not silently reopen a completed practice', async () => {
    status = 'completed';
    renderOwn();
    await screen.findByText('Finalizada');
    await openRecords();
    expect(screen.queryByRole('button', { name: 'Crear' })).toBeNull();
    expect(await screen.findByText('01:35:00')).toBeDefined();
  });
  it('keeps the legacy supervisor view read-only', async () => {
    render(
      <PracticumManagementPanel
        identity={{
          ...student,
          roles: ['psychologist'],
          permissions: ['practicum.read_supervised'],
        }}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Ver horas' }));
    await screen.findByRole('table');
    for (const name of [
      'Crear actividad',
      'Asignar actividad',
      'Corregir',
      'Anular',
      'Registro manual',
    ])
      expect(screen.queryByRole('button', { name })).toBeNull();
  });
  it('edits only state and reason without assigning a supervisor', async () => {
    const saved = vi.fn();
    render(
      <PlacementForms
        placement={profile}
        onSaved={saved}
        onCancel={() => {}}
      />,
    );
    expect(
      within(screen.getByLabelText('Estado'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Activa', 'Finalizada']);
    expect(screen.queryByLabelText('Supervisor')).toBeNull();
    fireEvent.change(screen.getByLabelText('Estado'), {
      target: { value: 'completed' },
    });
    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: 'Trabajo concluido' },
    });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(
      JSON.parse(callsTo('/placement', 'PATCH')[0][1]!.body as string),
    ).toEqual({ status: 'completed', version: 1, reason: 'Trabajo concluido' });
  });
  it('combines activities and hours, starts Resume immediately, and hides state and manual controls', async () => {
    renderOwn();
    const resume = await screen.findByRole('button', { name: 'Retomar tarea' });
    expect(screen.queryByRole('table')).toBeNull();
    for (const name of [
      'Registro manual',
      'Cambiar estado',
      'Guardar estado',
      'Corregir',
    ])
      expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByText('Activa')).toBeNull();
    fireEvent.click(resume);
    await screen.findByRole('region', { name: 'Cronómetro de práctica' });
    expect(screen.queryByRole('dialog')).toBeNull();
    const activeRow = screen.getByRole('article', {
      name: 'Actividad: ' + assigned.title,
    });
    expect(
      within(activeRow).queryByRole('button', { name: /Retomar/u }),
    ).toBeNull();
    expect(
      within(activeRow).getByLabelText('Tiempo transcurrido'),
    ).toBeDefined();
    expect(
      within(activeRow).getByRole('button', {
        name: 'Detener actividad ' + assigned.title,
      }),
    ).toBeDefined();
    await openRecords();
    expect(
      screen.queryByRole('region', { name: 'Actividades de la práctica' }),
    ).toBeNull();
    expect(callsTo('/timer')).toHaveLength(1);
    expect(JSON.parse(callsTo('/timer')[0][1]!.body as string)).toMatchObject({
      taskId: assigned.id,
      description: assigned.description,
    });
  });
  it('shows only Delete, Edit and Resume on each editable row and edits labels without time inputs', async () => {
    renderOwn();
    const table = await openRecords();
    await within(table).findByText('Trabajo anterior');
    expect(
      within(table)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Eliminar', 'Editar', 'Retomar']);
    fireEvent.click(within(table).getByRole('button', { name: 'Editar' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar registro' });
    await waitFor(() =>
      expect(
        (within(dialog).getByLabelText('Proyecto') as HTMLInputElement)
          .disabled,
      ).toBe(false),
    );
    expect(
      (within(dialog).getByLabelText('Proyecto') as HTMLInputElement).value,
    ).toBe(entry.projectLabel);
    expect(
      (within(dialog).getByLabelText('Actividad') as HTMLInputElement).value,
    ).toBe(entry.taskTitle);
    expect(
      (within(dialog).getByLabelText('Descripción') as HTMLInputElement).value,
    ).toBe(entry.description);
    expect(dialog.querySelector('input[type="datetime-local"]')).toBeNull();
    fill('Talleres', 'Preparar materiales', 'Descripción editada');
    fireEvent.submit(within(dialog).getByRole('form'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      JSON.parse(callsTo('/entry', 'PATCH')[0][1]!.body as string),
    ).toEqual({
      title: 'Preparar materiales',
      projectLabel: 'Talleres',
      description: 'Descripción editada',
      version: 1,
    });
    expect(within(table).getByText('Descripción editada')).toBeDefined();
    expect(within(table).getByText('01:35:00')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Historial' })).toBeNull();
    expect(callsTo('/history', 'GET')).toHaveLength(0);
  });
  it('deletes logically after confirmation, removes the row and updates the total', async () => {
    renderOwn();
    const table = await openRecords();
    fireEvent.click(
      await within(table).findByRole('button', { name: 'Eliminar' }),
    );
    expect(callsTo('/void')).toHaveLength(0);
    const dialog = screen.getByRole('dialog', { name: 'Eliminar registro' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(JSON.parse(callsTo('/void')[0][1]!.body as string)).toEqual({
      version: 1,
      reason: 'Time entry deleted by user',
    });
    expect(within(table).queryByText('Trabajo anterior')).toBeNull();
    expect(screen.getByText('0 horas y 0 minutos')).toBeDefined();
  });
  it('resumes a table row directly with its saved details and without a modal', async () => {
    renderOwn();
    const table = await openRecords();
    fireEvent.click(
      await within(table).findByRole('button', { name: 'Retomar' }),
    );
    await screen.findByRole('region', { name: 'Cronómetro de práctica' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.parse(callsTo('/resume')[0][1]!.body as string)).toEqual({
      id: expect.any(String),
    });
    expect(callsTo('/entry', 'PATCH')).toHaveLength(0);
  });
  it('switches between focused tabs with the keyboard without mixing the two panels', async () => {
    renderOwn();
    const activities = await screen.findByRole('tab', { name: 'Actividades' });
    expect(activities.getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.keyDown(activities, { key: 'ArrowRight' });
    await screen.findByRole('table');
    const hours = screen.getByRole('tab', { name: 'Registro de horas' });
    expect(hours.getAttribute('aria-selected')).toBe('true');
    expect(
      screen.queryByRole('region', { name: 'Actividades de la práctica' }),
    ).toBeNull();
    fireEvent.keyDown(hours, { key: 'Home' });
    expect(screen.queryByRole('table')).toBeNull();
    expect(activities.getAttribute('aria-selected')).toBe('true');
  });
  it('pins the running activity even when it is outside the loaded task page and returns to Resume after stop', async () => {
    paginated = true;
    running = {
      ...entry,
      endedAt: null,
      durationSeconds: null,
      source: 'timer',
    };
    renderOwn();
    const row = await screen.findByRole('article', {
      name: 'Actividad: ' + assigned.title,
    });
    expect(within(row).getByText('En curso')).toBeDefined();
    expect(within(row).queryByRole('button', { name: /Retomar/u })).toBeNull();
    expect(within(row).getByLabelText('Tiempo transcurrido')).toBeDefined();
    paginated = false;
    fireEvent.click(
      within(row).getByRole('button', {
        name: 'Detener actividad ' + assigned.title,
      }),
    );
    await screen.findByRole('button', { name: /Retomar tarea/u });
    expect(callsTo('/stop')).toHaveLength(1);
    expect(screen.queryByText('En curso')).toBeNull();
  });
});
