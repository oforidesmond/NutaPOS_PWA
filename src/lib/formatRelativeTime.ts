type RelativeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const DIVISIONS: { amount: number; unit: RelativeUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

const UNIT_LABELS: Record<RelativeUnit, [singular: string, plural: string]> = {
  second: ['second', 'seconds'],
  minute: ['minute', 'minutes'],
  hour: ['hour', 'hours'],
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years'],
};

let cachedRtf: Intl.RelativeTimeFormat | null | undefined;

function getRelativeTimeFormatter(): Intl.RelativeTimeFormat | null {
  if (cachedRtf !== undefined) return cachedRtf;
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function') {
      cachedRtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
      return cachedRtf;
    }
  } catch {
    // Older runtimes may not support RelativeTimeFormat.
  }
  cachedRtf = null;
  return null;
}

function fallbackFormat(value: number, unit: RelativeUnit): string {
  const n = Math.abs(Math.round(value));
  const [singular, plural] = UNIT_LABELS[unit];
  const label = n === 1 ? singular : plural;
  if (value < 0) return `${n} ${label} ago`;
  if (value > 0) return `in ${n} ${label}`;
  return 'just now';
}

function formatDelta(deltaSeconds: number): string {
  let delta = deltaSeconds;
  for (const { amount, unit } of DIVISIONS) {
    if (Math.abs(delta) < amount) {
      const rounded = Math.round(delta);
      const rtf = getRelativeTimeFormatter();
      if (rtf) return rtf.format(rounded, unit);
      return fallbackFormat(rounded, unit);
    }
    delta /= amount;
  }
  return '';
}

/** Human-readable relative time (for example "2 hours ago"). */
export function formatRelativeTime(isoDate: string, nowMs: number = Date.now()): string {
  const then = new Date(isoDate).getTime();
  if (!Number.isFinite(then)) return '';
  const deltaSeconds = (then - nowMs) / 1000;
  return formatDelta(deltaSeconds);
}

/** Prefix for the detail sheet (for example "Sent 2 hours ago"). */
export function formatSentRelative(isoDate: string, nowMs: number = Date.now()): string {
  const rel = formatRelativeTime(isoDate, nowMs);
  if (!rel) return '';
  return `Sent ${rel}`;
}
