export type CalendarDay = Readonly<{
  date: string;
  day: number;
  inMonth: boolean;
}>;

export function boliviaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Six Monday-first weeks, calculated in UTC to keep calendar dates stable. */
export function monthDays(month: Date): readonly CalendarDay[] {
  const year = month.getUTCFullYear();
  const index = month.getUTCMonth();
  const first = new Date(Date.UTC(year, index, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, position) => {
    const date = new Date(Date.UTC(year, index, 1 - offset + position));
    return {
      date: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === index,
    };
  });
}
