/** Local-calendar date key, YYYY-MM-DD, from the machine's own timezone. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isSameLocalDay(iso: string, d: Date): boolean {
  return localDateKey(new Date(iso)) === localDateKey(d);
}
