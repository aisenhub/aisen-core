/** Display-only formatting of persisted instant timestamps.
 * Server contracts and form inputs stay in their original UTC/ISO domain.
 * Always identify the viewer's time-zone offset for a business instant.
 */
export function formatAdminInstant(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const instant = new Date(String(value));
  if (!Number.isFinite(instant.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    timeZoneName: 'shortOffset',
  }).format(instant);
}

export function formatAdminCalendarDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const instant = new Date(String(value));
  if (!Number.isFinite(instant.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant);
}
