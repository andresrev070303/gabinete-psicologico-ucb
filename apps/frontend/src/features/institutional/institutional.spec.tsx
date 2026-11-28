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
import { RecordDialog } from './RecordDialog';
import { RecordDetailsPanel } from './RecordDetailsPanel';
import { RecordActionDialog } from './RecordActionDialog';
import { InstitutionalPanel } from './InstitutionalPanel';
import * as api from './institutional.api';
import type { RecordDetails, InstitutionalRecord } from './institutional.types';
vi.mock('./institutional.api');
const directorId = '10000000-0000-4000-8000-000000000001',
  memberId = '10000000-0000-4000-8000-000000000002';
const record: InstitutionalRecord = {
  id: '10000000-0000-4000-8000-000000000003',
  kind: 'activity',
  type: 'talk',
  title: 'Orientación vocacional',
  description: 'Encuentro con estudiantes',
  startsAt: '2026-12-01T13:00:00Z',
  endsAt: '2026-12-01T15:00:00Z',
  status: 'planned',
  institutionId: null,
  institutionName: null,
  responsibleAccountId: directorId,
  responsibleName: 'Carla Espada',
  projectId: null,
  projectName: null,
  agreementId: null,
  agreementName: null,
  code: null,
  venue: 'UCB',
  results: null,
  reportedParticipants: null,
  version: 1,
  createdAt: '2026-11-27T12:00:00Z',
};
const details: RecordDetails = {
  record,
  team: [{ accountId: directorId, name: 'Carla Espada', roles: ['director'] }],
  related: [],
};
const catalog = {
  institutions: [{ id: memberId, name: 'Colegio de ejemplo', kind: 'school' }],
  people: [
    { accountId: directorId, name: 'Carla Espada', roles: ['director'] },
    { accountId: memberId, name: 'Fernando Aranjuez', roles: ['assistant'] },
  ],
  projects: [],
  agreements: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getInstitutionalCatalog).mockResolvedValue(catalog);
  vi.mocked(api.createRecord).mockResolvedValue(details);
  vi.mocked(api.updateRecord).mockResolvedValue(details);
  vi.mocked(api.changeRecordStatus).mockResolvedValue(details);
  vi.mocked(api.archiveRecord).mockResolvedValue(null);
  vi.mocked(api.getRecord).mockResolvedValue(details);
  vi.mocked(api.listRecords).mockResolvedValue({
    items: [record],
    nextCursor: null,
  });
});
afterEach(cleanup);
describe('Unified institutional creation', () => {
  it('searches by name or institution and resets pagination without showing extra filters', async () => {
    vi.mocked(api.listRecords).mockImplementation(async (filters) => ({
      items: filters.search ? [] : [record],
      nextCursor: filters.search ? null : 'next-page',
    }));
    render(
      <InstitutionalPanel
        identity={{
          accountId: directorId,
          givenNames: 'Carla',
          familyNames: 'Espada',
          email: 'carla@example.test',
          roles: ['director'],
          permissions: ['institutional.manage'],
        }}
      />,
    );
    await screen.findByRole('button', { name: `Ver ${record.title}` });
    expect(screen.queryByLabelText('Tipo')).toBeNull();
    expect(screen.queryByLabelText('Estado')).toBeNull();
    expect(screen.queryByLabelText('Desde')).toBeNull();
    expect(screen.queryByLabelText('Hasta')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(api.listRecords).toHaveBeenCalledWith(
        expect.objectContaining({ search: '' }),
        'next-page',
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByPlaceholderText('Nombre o institución'), {
      target: { value: ' Colegio San Pedro ' },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Buscar registros institucionales' }),
    );
    await waitFor(() =>
      expect(api.listRecords).toHaveBeenCalledWith(
        { type: '', status: '', search: 'Colegio San Pedro', from: '', to: '' },
        null,
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'No encontramos registros para esta búsqueda',
      }),
    ).toBeDefined();
  });
  it('adapts the same dropdown and form to an agreement with dates and an institution', async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    render(
      <RecordDialog accountId={directorId} onSaved={saved} onClose={vi.fn()} />,
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText('¿Qué quieres registrar?') as HTMLSelectElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText('¿Qué quieres registrar?'), {
      target: { value: 'agreement' },
    });
    expect(screen.queryByLabelText('Lugar')).toBeNull();
    expect(
      screen.getByLabelText('Inicio de vigencia').getAttribute('type'),
    ).toBe('date');
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Convenio con colegio' },
    });
    fireEvent.change(screen.getByLabelText('Institución'), {
      target: { value: memberId },
    });
    fireEvent.change(screen.getByLabelText('Inicio de vigencia'), {
      target: { value: '2027-01-01' },
    });
    fireEvent.click(screen.getByLabelText('Fernando Aranjuez'));
    fireEvent.submit(
      screen.getByRole('form', { name: 'Datos del registro institucional' }),
    );
    await waitFor(() => expect(api.createRecord).toHaveBeenCalledOnce());
    expect(vi.mocked(api.createRecord).mock.calls[0]![0]).toMatchObject({
      kind: 'agreement',
      type: 'agreement',
      title: 'Convenio con colegio',
      startsAt: '2027-01-01',
      institutionId: memberId,
      memberAccountIds: [memberId],
      venue: null,
      projectId: null,
    });
  });
  it('creates an independent talk and converts the Bolivian schedule to UTC', async () => {
    render(
      <RecordDialog
        accountId={directorId}
        onSaved={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText('¿Qué quieres registrar?') as HTMLSelectElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText('¿Qué quieres registrar?'), {
      target: { value: 'talk' },
    });
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: record.title },
    });
    fireEvent.change(screen.getByLabelText('Fecha de inicio'), {
      target: { value: '2026-12-01' },
    });
    fireEvent.change(screen.getByLabelText('Hora de inicio'), {
      target: { value: '09:00' },
    });
    fireEvent.change(screen.getByLabelText('Fecha de fin'), {
      target: { value: '2026-12-01' },
    });
    fireEvent.change(screen.getByLabelText('Hora de fin'), {
      target: { value: '11:00' },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Datos del registro institucional' }),
    );
    await waitFor(() => expect(api.createRecord).toHaveBeenCalledOnce());
    expect(vi.mocked(api.createRecord).mock.calls[0]![0]).toMatchObject({
      kind: 'activity',
      type: 'talk',
      startsAt: '2026-12-01T13:00:00.000Z',
      endsAt: '2026-12-01T15:00:00.000Z',
      agreementId: null,
      projectId: null,
    });
  });
  it('keeps Other last in the record and institution dropdowns', async () => {
    render(
      <RecordDialog
        accountId={directorId}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const types = screen.getByLabelText(
      '¿Qué quieres registrar?',
    ) as HTMLSelectElement;
    await waitFor(() => expect(types.disabled).toBe(false));
    expect(types.options[types.options.length - 1]?.value).toBe('other');
    fireEvent.click(
      screen.getByRole('button', { name: '+ Añadir institución' }),
    );
    const institutions = screen.getByLabelText(
      'Tipo de institución',
    ) as HTMLSelectElement;
    expect(institutions.options[institutions.options.length - 1]?.value).toBe(
      'other',
    );
  });
  it('preloads the Bolivian schedule and saves an edited afternoon interval', async () => {
    render(
      <RecordDialog
        details={details}
        accountId={directorId}
        onSaved={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText('¿Qué quieres registrar?') as HTMLSelectElement)
          .disabled,
      ).toBe(false),
    );
    expect(
      (screen.getByLabelText('Fecha de inicio') as HTMLInputElement).value,
    ).toBe('2026-12-01');
    expect(
      (screen.getByLabelText('Hora de inicio') as HTMLInputElement).value,
    ).toBe('09:00');
    expect(screen.queryByLabelText('AM/PM de inicio')).toBeNull();
    expect(
      (screen.getByLabelText('Hora de fin') as HTMLInputElement).value,
    ).toBe('11:00');
    for (const [suffix, time] of [
      ['inicio', '13:30'],
      ['fin', '14:30'],
    ]) {
      fireEvent.change(screen.getByLabelText(`Hora de ${suffix}`), {
        target: { value: time },
      });
    }
    expect(screen.getByText(/Duración programada: 1 h 0 min/u)).toBeDefined();
    fireEvent.submit(
      screen.getByRole('form', { name: 'Datos del registro institucional' }),
    );
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalledOnce());
    expect(vi.mocked(api.updateRecord).mock.calls[0]![1]).toMatchObject({
      startsAt: '2026-12-01T17:30:00.000Z',
      endsAt: '2026-12-01T18:30:00.000Z',
      version: 1,
    });
  });
  it('requires a complete optional end and a valid 24-hour clock before saving', async () => {
    render(
      <RecordDialog
        details={details}
        accountId={directorId}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText('¿Qué quieres registrar?') as HTMLSelectElement)
          .disabled,
      ).toBe(false),
    );
    const form = screen.getByRole('form', {
      name: 'Datos del registro institucional',
    }) as HTMLFormElement;
    fireEvent.change(screen.getByLabelText('Hora de fin'), {
      target: { value: '' },
    });
    expect(form.checkValidity()).toBe(false);
    fireEvent.submit(form);
    expect(api.updateRecord).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Hora de fin'), {
      target: { value: '25:30' },
    });
    expect(
      (screen.getByLabelText('Hora de fin') as HTMLInputElement).value,
    ).toBe('');
    expect(form.checkValidity()).toBe(false);
    fireEvent.submit(form);
    expect(api.updateRecord).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Hora de fin'), {
      target: { value: '11:30' },
    });
    expect(form.checkValidity()).toBe(true);
  });
  it('keeps 24-hour input unchanged and preserves an existing afternoon schedule when saving', async () => {
    const afternoonDetails: RecordDetails = {
      ...details,
      record: {
        ...record,
        startsAt: '2026-12-01T19:00:00Z',
        endsAt: '2026-12-01T20:00:00Z',
      },
    };
    render(
      <RecordDialog
        details={afternoonDetails}
        accountId={directorId}
        onSaved={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText('¿Qué quieres registrar?') as HTMLSelectElement)
          .disabled,
      ).toBe(false),
    );
    expect(
      (screen.getByLabelText('Hora de inicio') as HTMLInputElement).value,
    ).toBe('15:00');
    expect(
      (screen.getByLabelText('Hora de fin') as HTMLInputElement).value,
    ).toBe('16:00');
    expect(screen.queryByLabelText('AM/PM de inicio')).toBeNull();
    expect(screen.queryByLabelText('AM/PM de fin')).toBeNull();
    for (const time of ['15', '15:', '15:3', '15:30']) {
      fireEvent.change(screen.getByLabelText('Hora de inicio'), {
        target: { value: time },
      });
      expect(
        (screen.getByLabelText('Hora de inicio') as HTMLInputElement).value,
      ).toBe(time);
    }
    fireEvent.change(screen.getByLabelText('Hora de inicio'), {
      target: { value: '15:00' },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Datos del registro institucional' }),
    );
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalledOnce());
    expect(vi.mocked(api.updateRecord).mock.calls[0]![1]).toMatchObject({
      startsAt: '2026-12-01T19:00:00.000Z',
      endsAt: '2026-12-01T20:00:00.000Z',
    });
  });
  it('completes an activity with a confirmation and no additional fields', async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    render(
      <RecordActionDialog
        record={record}
        action={{ status: 'completed', label: 'Finalizar' }}
        onSaved={saved}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Resultados')).toBeNull();
    expect(screen.queryByLabelText('Asistentes o beneficiarios')).toBeNull();
    expect(screen.queryByLabelText('Motivo')).toBeNull();
    fireEvent.submit(
      screen.getByRole('form', { name: 'Confirmar acción institucional' }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(api.changeRecordStatus).toHaveBeenCalledWith(
      record,
      {
        version: 1,
        status: 'completed',
        reason: 'Finalizar',
        results: null,
        reportedParticipants: null,
      },
      expect.any(AbortSignal),
    );
    expect(api.archiveRecord).not.toHaveBeenCalled();
  });
  it('formats compact hours, rejects hour 25 and saves carried minutes', async () => {
    render(
      <RecordDialog
        details={details}
        accountId={directorId}
        onSaved={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText('¿Qué quieres registrar?') as HTMLSelectElement)
          .disabled,
      ).toBe(false),
    );
    expect(screen.getAllByText('Hora')).toHaveLength(2);
    const start = screen.getByLabelText('Hora de inicio') as HTMLInputElement;
    const end = screen.getByLabelText('Hora de fin') as HTMLInputElement;
    fireEvent.change(start, { target: { value: '1500' } });
    expect(start.value).toBe('15:00');
    fireEvent.change(start, { target: { value: '25:00' } });
    expect(start.value).toBe('15:00');
    fireEvent.change(start, { target: { value: '1560' } });
    expect(start.value).toBe('16:00');
    fireEvent.change(end, { target: { value: '1660' } });
    expect(end.value).toBe('17:00');
    fireEvent.submit(
      screen.getByRole('form', { name: 'Datos del registro institucional' }),
    );
    await waitFor(() => expect(api.updateRecord).toHaveBeenCalledOnce());
    expect(vi.mocked(api.updateRecord).mock.calls[0]![1]).toMatchObject({
      startsAt: '2026-12-01T20:00:00.000Z',
      endsAt: '2026-12-01T21:00:00.000Z',
    });
  });
  it('orders Finalizar, Editar, Eliminar and keeps editing after completion', async () => {
    const completed: RecordDetails = {
      ...details,
      record: { ...record, status: 'completed', version: 2 },
    };
    vi.mocked(api.getRecord)
      .mockResolvedValueOnce(details)
      .mockResolvedValue(completed);
    vi.mocked(api.changeRecordStatus).mockResolvedValue(completed);
    render(
      <RecordDetailsPanel
        recordKey={record}
        accountId={directorId}
        canManage
        onBack={vi.fn()}
        onOpen={vi.fn()}
        onChanged={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const finish = await screen.findByRole('button', { name: 'Finalizar' });
    const actions = finish.parentElement!;
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Finalizar', 'Editar', 'Eliminar']);
    fireEvent.click(finish);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await screen.findByText('Finalizada');
    expect(screen.queryByRole('button', { name: 'Finalizar' })).toBeNull();
    const remaining = screen.getByRole('button', {
      name: 'Editar',
    }).parentElement!;
    expect(
      within(remaining)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Editar', 'Eliminar']);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(
      await screen.findByRole('heading', { name: 'Editar registro' }),
    ).toBeDefined();
  });
  it('confirms logical deletion without marking the record as completed', async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    render(
      <RecordActionDialog
        record={record}
        action={{ status: 'archive', label: 'Eliminar registro' }}
        onSaved={saved}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/su estado anterior y su historial/u),
    ).toBeDefined();
    fireEvent.submit(
      screen.getByRole('form', { name: 'Confirmar acción institucional' }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(api.archiveRecord).toHaveBeenCalledWith(
      record,
      { version: 1, reason: 'Eliminar registro' },
      expect.any(AbortSignal),
    );
    expect(api.changeRecordStatus).not.toHaveBeenCalled();
  });
  it('shows assigned members a read-only record without director operations', async () => {
    render(
      <RecordDetailsPanel
        recordKey={record}
        accountId={memberId}
        canManage={false}
        onBack={vi.fn()}
        onOpen={vi.fn()}
        onChanged={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await screen.findByRole('heading', { name: record.title });
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalizar' })).toBeNull();
  });
  it('opens the unified creator from the single management list', async () => {
    render(
      <InstitutionalPanel
        identity={{
          accountId: directorId,
          givenNames: 'Carla',
          familyNames: 'Espada',
          email: 'carla@example.test',
          roles: ['director'],
          permissions: ['institutional.manage'],
        }}
      />,
    );
    await screen.findByRole('button', { name: `Ver ${record.title}` });
    fireEvent.click(screen.getByRole('button', { name: '+ Crear' }));
    expect(
      await screen.findByLabelText('¿Qué quieres registrar?'),
    ).toBeDefined();
  });
});
