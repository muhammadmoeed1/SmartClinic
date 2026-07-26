import { AxiosError } from 'axios';
import type { ApiErrorBody, AppointmentStatus, Role } from './types';

/**
 * SmartClinic operates on a single fixed clinic timezone (Asia/Karachi,
 * UTC+5, no DST) regardless of the browser's own timezone — otherwise a
 * slot booked as "9 AM" would render at a different wall-clock hour (or
 * fall outside the displayed day entirely) depending on where the person
 * viewing it happens to be. Every date/time helper below is anchored to
 * this, mirroring the backend's `common/clinic-time.ts`.
 */
const CLINIC_TZ = 'Asia/Karachi';

function clinicParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** Home route for each role. */
export function roleHome(role: Role): string {
  switch (role) {
    case 'patient':
      return '/patient';
    case 'doctor':
      return '/doctor';
    case 'receptionist':
      return '/reception';
    case 'admin':
      return '/admin';
  }
}

/** Clinic-local date -> YYYY-MM-DD (as expected by the API's `date` query params). */
export function toDateStr(d: Date): string {
  const p = clinicParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: CLINIC_TZ });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: CLINIC_TZ,
  });
}

export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)} · ${fmtTime(iso)}`;
}

/** "HH:mm" key in clinic-local time, used to place blocks on the reception board. */
export function localTimeKey(iso: string): string {
  const p = clinicParts(new Date(iso));
  return `${p.hour}:${p.minute}`;
}

/** Hour of day (0-23) in clinic-local time, for a given ISO timestamp. */
export function clinicHour(iso: string): number {
  return parseInt(clinicParts(new Date(iso)).hour, 10);
}

/** Current half-hour-bucket "HH:mm" key in clinic-local time (e.g. "14:03" -> "14:00"). */
export function nowSlotKey(): string {
  const p = clinicParts(new Date());
  const minute = parseInt(p.minute, 10) < 30 ? '00' : '30';
  return `${p.hour}:${minute}`;
}

export function statusLabel(status: AppointmentStatus): string {
  const map: Record<AppointmentStatus, string> = {
    scheduled: 'Scheduled',
    checked_in: 'Checked in',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No-show',
  };
  return map[status];
}

/** Extract a human-readable message from any thrown error (axios or not). */
export function getErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const body = err.response?.data as Partial<ApiErrorBody> | undefined;
    if (body?.message) {
      return Array.isArray(body.message) ? body.message.join(', ') : String(body.message);
    }
    if (err.response) return `Request failed (${err.response.status})`;
    return 'Cannot reach the server. Is the backend running?';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

/** True when an AI endpoint answered 503 / { fallback: true }. */
export function isAiFallback(err: unknown): boolean {
  if (err instanceof AxiosError) {
    if (err.response?.status === 503) return true;
    const data = err.response?.data as { fallback?: boolean } | undefined;
    if (data?.fallback === true) return true;
  }
  return false;
}

/** True for the 403 PREAUTH_NOT_APPROVED finalize rejection. */
export function isPreauthBlocked(err: unknown): boolean {
  if (err instanceof AxiosError && err.response?.status === 403) {
    return JSON.stringify(err.response.data ?? '').includes('PREAUTH_NOT_APPROVED');
  }
  return false;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Hours until an ISO timestamp (negative when in the past). */
export function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}
