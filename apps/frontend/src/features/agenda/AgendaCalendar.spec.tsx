// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgendaCalendar } from './AgendaCalendar';
import { boliviaToday, monthDays } from './agenda.calendar';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('Agenda calendar', () => {
  it('uses the current date in Bolivia, including the UTC date boundary', () => {
    expect(boliviaToday(new Date('2026-12-01T02:00:00Z'))).toBe('2026-11-30');
  });
  it('builds Monday-first weeks with leap days and adjacent dates', () => {
    const november = monthDays(new Date('2026-11-01T00:00:00Z'));
    expect(november).toHaveLength(42);
    expect(november[0]).toEqual({
      date: '2026-10-26',
      day: 26,
      inMonth: false,
    });
    expect(november.filter((day) => day.inMonth)).toHaveLength(30);
    const february = monthDays(new Date('2028-02-01T00:00:00Z'));
    expect(february.filter((day) => day.inMonth)).toHaveLength(29);
    expect(
      february.some((day) => day.date === '2028-02-29' && day.inMonth),
    ).toBe(true);
  });
  it('navigates across years and returns to the current month without event controls', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-28T16:00:00Z'));
    const { container } = render(<AgendaCalendar />);
    expect(
      screen.getByRole('table', { name: 'noviembre de 2026' }),
    ).toBeDefined();
    expect(
      container
        .querySelector('time[aria-current="date"]')
        ?.getAttribute('datetime'),
    ).toBe('2026-11-28');
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(screen.getByRole('table', { name: 'enero de 2027' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(
      screen.getByRole('table', { name: 'diciembre de 2026' }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(
      screen.getByRole('table', { name: 'noviembre de 2026' }),
    ).toBeDefined();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    vi.setSystemTime(new Date('2026-12-01T04:00:00Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(
      screen.getByRole('table', { name: 'diciembre de 2026' }),
    ).toBeDefined();
    expect(
      container
        .querySelector('time[aria-current="date"]')
        ?.getAttribute('datetime'),
    ).toBe('2026-12-01');
  });
});
