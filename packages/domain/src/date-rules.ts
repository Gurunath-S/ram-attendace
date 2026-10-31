export const FACTORY_TIMEZONE = 'Asia/Kolkata';

/**
 * Gets the current date string (YYYY-MM-DD) in the factory timezone.
 */
export function getFactoryTodayDate(timeZone: string = FACTORY_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Returns Monday (start) and Sunday (end) for the week containing the given date.
 */
export function getWeekBounds(dateStr: string): { weekStart: string; weekEnd: string } {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

/**
 * Returns the list of 7 dates (YYYY-MM-DD) from Monday to Sunday for the week starting at weekStart.
 */
export function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const start = new Date(weekStart + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    const cur = new Date(start);
    cur.setUTCDate(start.getUTCDate() + i);
    dates.push(cur.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Returns start and end dates for a month (YYYY-MM).
 */
export function getMonthBounds(monthStr: string): { monthStart: string; monthEnd: string; totalDays: number } {
  const [yearStr, mStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(mStr, 10); // 1-12

  const startDate = `${yearStr}-${mStr.padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${yearStr}-${mStr.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return {
    monthStart: startDate,
    monthEnd: endDate,
    totalDays: lastDay,
  };
}
