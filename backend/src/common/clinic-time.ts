/**
 * SmartClinic operates on a single fixed clinic timezone (Asia/Karachi,
 * UTC+5, no DST) regardless of what timezone the server or a given
 * browser happens to run in. Slot generation, day-range filtering, and
 * risk-scoring "hour of day"/"day of week" features must all agree on
 * this, or a slot booked at "9 AM" on one machine silently becomes a
 * different wall-clock hour when read back on another.
 */
const CLINIC_TZ = 'Asia/Karachi';
const CLINIC_TZ_OFFSET = '+05:00';

function clinicParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    weekday: get('weekday'),
  };
}

/** Builds the absolute instant for a clinic-local wall-clock date + hour:minute. */
export function clinicTime(date: string, hour: number, minute = 0): Date {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${date}T${hh}:${mm}:00${CLINIC_TZ_OFFSET}`);
}

/** [start, end] of a YYYY-MM-DD date, in clinic-local wall-clock terms. */
export function clinicDayRange(date: string): [Date, Date] {
  return [
    new Date(`${date}T00:00:00${CLINIC_TZ_OFFSET}`),
    new Date(`${date}T23:59:59.999${CLINIC_TZ_OFFSET}`),
  ];
}

/** YYYY-MM-DD for an absolute instant, in clinic-local calendar terms. */
export function clinicDateStr(d: Date): string {
  const p = clinicParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Hour of day (0-23) for an absolute instant, in clinic-local time. */
export function clinicHour(d: Date): number {
  const h = parseInt(clinicParts(d).hour, 10);
  return h === 24 ? 0 : h; // ICU formats midnight as "24" in some engines
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Day of week (0=Sun..6=Sat) for an absolute instant, in clinic-local time. */
export function clinicDayOfWeek(d: Date): number {
  return WEEKDAY_INDEX[clinicParts(d).weekday] ?? 0;
}
