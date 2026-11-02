/**
 * Small display helpers shared by the result cards.
 * All of these run on the client after the fetch resolves, so locale output
 * never affects the server-rendered markup.
 */

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US');
}

export function formatDateTime(
  value: string | null | undefined,
  fallback = '—'
): string {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Formats a position as `#12.3`, keeping the API's one-decimal precision. */
export function formatPosition(position: number | null | undefined): string {
  if (position === null || position === undefined || Number.isNaN(position)) {
    return '—';
  }
  return `#${position}`;
}
