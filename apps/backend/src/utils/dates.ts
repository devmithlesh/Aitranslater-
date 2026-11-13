const pad = (n: number): string => String(n).padStart(2, '0');

/** Local-calendar day key, "YYYY-MM-DD". */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local-calendar month key, "YYYY-MM". */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** Local midnight `days` days before `now`. */
export function daysAgo(now: Date, days: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
}
