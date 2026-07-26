import { useEffect, useMemo, useState, type DragEvent } from 'react';
import type { AppointmentDto, DoctorDto, NoShowRiskDto } from '../../types';
import { useAppointmentsStore } from '../../store/appointments';
import { updateAppointment } from '../../api/appointments';
import { getDoctors } from '../../api/doctors';
import { getNoShowRisk } from '../../api/ai';
import { sendReminder } from '../../api/notifications';
import { fmtTime, getErrorMessage, localTimeKey, nowSlotKey, statusLabel, todayStr, toDateStr } from '../../utils';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { StatusBadge } from '../../components/Badge';
import { IconWarning } from '../../components/Icons';
import { toast } from '../../store/toasts';

/** New appointments can only be booked 9 AM–5 PM — matches the backend's
 * DAY_START_HOUR/DAY_END_HOUR. The board still displays the full day (see
 * TIME_SECTIONS below) so an existing appointment is never invisible, but
 * only slots inside clinic hours accept a drag-to-reschedule drop. */
const CLINIC_START_HOUR = 9;
const CLINIC_END_HOUR = 17;

interface TimeSection {
  key: string;
  label: string;
  startHour: number;
  endHour: number; // exclusive
}

/** Full 24h split into four sections so an appointment booked at any hour
 * (e.g. a walk-in logged outside standard hours) is always shown somewhere,
 * instead of only ever rendering the 9-to-5 clinic window. */
const TIME_SECTIONS: TimeSection[] = [
  { key: 'night', label: 'Night · 12–6 AM', startHour: 0, endHour: 6 },
  { key: 'morning', label: 'Morning · 6 AM–12 PM', startHour: 6, endHour: 12 },
  { key: 'afternoon', label: 'Afternoon · 12–6 PM', startHour: 12, endHour: 18 },
  { key: 'evening', label: 'Evening · 6 PM–12 AM', startHour: 18, endHour: 24 },
];

function sectionTimes(section: TimeSection): string[] {
  const times: string[] = [];
  for (let h = section.startHour; h < section.endHour; h++) {
    times.push(`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`);
  }
  return times;
}

const RISK_THRESHOLD = 0.65;

interface PendingMove {
  appointment: AppointmentDto;
  time: string; // HH:mm
  newStartIso: string;
}

export default function BookingBoard() {
  const [date, setDate] = useState(todayStr());
  const { items, loading, error, fetch } = useAppointmentsStore();
  const [doctors, setDoctors] = useState<DoctorDto[] | null>(null);
  const [doctorsError, setDoctorsError] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState('');
  const [risks, setRisks] = useState<Record<string, NoShowRiskDto>>({});
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [moveSaving, setMoveSaving] = useState(false);
  const [detail, setDetail] = useState<AppointmentDto | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    getDoctors()
      .then(setDoctors)
      .catch((err) => setDoctorsError(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    void fetch({ date, doctorId: doctorId || undefined });
  }, [fetch, date, doctorId]);

  // No-show risk for the day (non-blocking if it fails).
  useEffect(() => {
    let cancelled = false;
    getNoShowRisk(date)
      .then((rows) => {
        if (cancelled) return;
        const map: Record<string, NoShowRiskDto> = {};
        for (const r of rows) map[r.appointmentId] = r;
        setRisks(map);
      })
      .catch(() => {
        if (!cancelled) setRisks({});
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const selectedDoctor = doctors?.find((d) => d.id === doctorId) ?? null;

  // Live board: socket appointment.updated/checkin events upsert into the store.
  const dayAppointments = useMemo(
    () =>
      items.filter(
        (a) => a.doctorId === doctorId && toDateStr(new Date(a.startTime)) === date && a.status !== 'cancelled',
      ),
    [items, doctorId, date],
  );

  const byTime = useMemo(() => {
    const map = new Map<string, AppointmentDto>();
    for (const a of dayAppointments) map.set(localTimeKey(a.startTime), a);
    return map;
  }, [dayAppointments]);

  const nowKey = date === todayStr() ? nowSlotKey() : null;

  const detailLive = detail ? (items.find((a) => a.id === detail.id) ?? detail) : null;

  const onDrop = (e: DragEvent, time: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDragId(null);
    const appt = items.find((a) => a.id === id);
    if (!appt || appt.doctorId !== doctorId) return;
    if (byTime.has(time)) return;
    const newStartIso = new Date(`${date}T${time}:00`).toISOString();
    if (newStartIso === appt.startTime) return;
    setPendingMove({ appointment: appt, time, newStartIso });
  };

  const confirmMove = async () => {
    if (!pendingMove) return;
    setMoveSaving(true);
    try {
      const updated = await updateAppointment(pendingMove.appointment.id, {
        startTime: pendingMove.newStartIso,
      });
      useAppointmentsStore.getState().upsert(updated);
      toast('Appointment rescheduled.', 'success');
      setPendingMove(null);
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      toast(
        status === 409 ? 'That slot is already taken.' : getErrorMessage(err),
        'error',
      );
      setPendingMove(null);
    } finally {
      setMoveSaving(false);
    }
  };

  const patchStatus = async (appt: AppointmentDto, status: 'checked_in' | 'no_show' | 'cancelled') => {
    try {
      const updated = await updateAppointment(appt.id, { status });
      useAppointmentsStore.getState().upsert(updated);
      toast(`Marked as ${statusLabel(status).toLowerCase()}.`, 'success');
      if (status === 'cancelled') setDetail(null);
    } catch (err) {
      toast(getErrorMessage(err), 'error');
    }
  };

  const remind = async (appt: AppointmentDto) => {
    try {
      const res = await sendReminder(appt.id);
      toast(`Reminder sent via ${res.channel.toUpperCase()} to ${res.to}.`, 'success');
    } catch (err) {
      toast(getErrorMessage(err), 'error');
    }
  };

  const specialtyGroups = useMemo(() => {
    if (!doctors) return [];
    const groups = new Map<string, DoctorDto[]>();
    for (const d of doctors) {
      if (!groups.has(d.specialty)) groups.set(d.specialty, []);
      groups.get(d.specialty)!.push(d);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [doctors]);

  return (
    <div className="page page--full">
      <div className="page-header">
        <div>
          <h2>Booking board</h2>
          <p className="page-subtitle">
            Pick a doctor to see their day — drag a scheduled appointment onto a free clinic-hours slot to reschedule it.
          </p>
        </div>
        <div className="board-controls">
          <select
            className="input"
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            disabled={!doctors}
          >
            <option value="">Select a doctor…</option>
            {specialtyGroups.map(([specialty, docs]) => (
              <optgroup key={specialty} label={specialty}>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {doctorsError && <p className="inline-error">{doctorsError}</p>}
      {error && <p className="inline-error">{error}</p>}

      {!doctorsError && !doctors && <Spinner block label="Loading doctors…" />}

      {doctors && !doctorId && (
        <EmptyState
          title="Select a doctor"
          message="Choose a doctor above to see their booking board for the selected day."
        />
      )}

      {doctorId && loading && <Spinner block label="Loading board…" />}

      {doctorId && !loading && selectedDoctor && (
        <div className="board-single">
          <div className="board-single__header">
            <strong>{selectedDoctor.fullName}</strong>
            <span className="muted">{selectedDoctor.specialty}</span>
          </div>
          {TIME_SECTIONS.map((section) => (
            <BoardSection
              key={section.key}
              section={section}
              nowKey={nowKey}
              byTime={byTime}
              risks={risks}
              dragId={dragId}
              setDragId={setDragId}
              onDrop={onDrop}
              onOpen={setDetail}
            />
          ))}
        </div>
      )}

      {pendingMove && (
        <Modal
          title="Reschedule appointment?"
          onClose={() => setPendingMove(null)}
          footer={
            <div className="actions-row">
              <Button variant="ghost" onClick={() => setPendingMove(null)}>
                Cancel
              </Button>
              <Button loading={moveSaving} onClick={() => void confirmMove()}>
                Confirm reschedule
              </Button>
            </div>
          }
        >
          <p>
            Move <strong>{pendingMove.appointment.patient.fullName}</strong> with{' '}
            {pendingMove.appointment.doctor.fullName} from{' '}
            <strong>{fmtTime(pendingMove.appointment.startTime)}</strong> to{' '}
            <strong>{pendingMove.time}</strong> on {date}?
          </p>
        </Modal>
      )}

      {detailLive && (
        <Modal title="Appointment" onClose={() => setDetail(null)}>
          <div className="stack">
            <div>
              <strong>{detailLive.patient.fullName}</strong>
              <p className="muted">
                {detailLive.doctor.fullName} ({detailLive.doctor.specialty}) ·{' '}
                {fmtTime(detailLive.startTime)}–{fmtTime(detailLive.endTime)}
              </p>
              {detailLive.reason && <p>{detailLive.reason}</p>}
            </div>
            <StatusBadge status={detailLive.status} />
            {risks[detailLive.id] && risks[detailLive.id].score > RISK_THRESHOLD && (
              <div className="risk-panel">
                <span className="risk-panel__title">
                  <IconWarning size={16} /> High no-show risk (
                  {(risks[detailLive.id].score * 100).toFixed(0)}%)
                </span>
                <ul>
                  {risks[detailLive.id].factors.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="actions-row actions-row--wrap">
              {detailLive.status === 'scheduled' && (
                <Button onClick={() => void patchStatus(detailLive, 'checked_in')}>Check in</Button>
              )}
              {(detailLive.status === 'scheduled' || detailLive.status === 'checked_in') && (
                <>
                  <Button variant="secondary" onClick={() => void remind(detailLive)}>
                    Send reminder
                  </Button>
                  <Button variant="danger" onClick={() => void patchStatus(detailLive, 'no_show')}>
                    Mark no-show
                  </Button>
                  <Button variant="ghost" onClick={() => void patchStatus(detailLive, 'cancelled')}>
                    Cancel appointment
                  </Button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function BoardSection({
  section,
  nowKey,
  byTime,
  risks,
  dragId,
  setDragId,
  onDrop,
  onOpen,
}: {
  section: TimeSection;
  nowKey: string | null;
  byTime: Map<string, AppointmentDto>;
  risks: Record<string, NoShowRiskDto>;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDrop: (e: DragEvent, time: string) => void;
  onOpen: (a: AppointmentDto) => void;
}) {
  const times = useMemo(() => sectionTimes(section), [section]);
  const appointmentCount = times.filter((t) => byTime.has(t)).length;
  const containsNow = nowKey !== null && times.includes(nowKey);
  // Open by default when there's something to see or "now" falls in this section.
  const defaultOpen = appointmentCount > 0 || containsNow;

  return (
    <details className="board-section" open={defaultOpen}>
      <summary className="board-section__summary">
        <span>{section.label}</span>
        <span className="board-section__count">
          {appointmentCount > 0 ? `${appointmentCount} booked` : 'No appointments'}
        </span>
      </summary>
      <div className="board-section__rows">
        {times.map((time) => (
          <BoardRow
            key={time}
            time={time}
            isNow={time === nowKey}
            appt={byTime.get(time)}
            bookable={parseInt(time.slice(0, 2), 10) >= CLINIC_START_HOUR && parseInt(time.slice(0, 2), 10) < CLINIC_END_HOUR}
            risk={byTime.get(time) ? risks[byTime.get(time)!.id] : undefined}
            dragId={dragId}
            setDragId={setDragId}
            onDrop={onDrop}
            onOpen={onOpen}
          />
        ))}
      </div>
    </details>
  );
}

function BoardRow({
  time,
  isNow,
  appt,
  bookable,
  risk,
  dragId,
  setDragId,
  onDrop,
  onOpen,
}: {
  time: string;
  isNow: boolean;
  appt: AppointmentDto | undefined;
  bookable: boolean;
  risk: NoShowRiskDto | undefined;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDrop: (e: DragEvent, time: string) => void;
  onOpen: (a: AppointmentDto) => void;
}) {
  const highRisk = risk && risk.score > RISK_THRESHOLD;
  const nowCls = isNow ? ' board-row--now' : '';

  return (
    <div className={`board-row${nowCls}${!bookable ? ' board-row--offhours' : ''}`}>
      <div className="board-row__time">{time}</div>
      <div className="board-row__cell">
        {appt ? (
          <div
            className={`board-block board-block--${appt.status} ${
              dragId === appt.id ? 'board-block--dragging' : ''
            }`}
            draggable={appt.status === 'scheduled'}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', appt.id);
              e.dataTransfer.effectAllowed = 'move';
              setDragId(appt.id);
            }}
            onDragEnd={() => setDragId(null)}
            onClick={() => onOpen(appt)}
            title={`${appt.patient.fullName} · ${statusLabel(appt.status)}`}
          >
            <span className="board-block__name">{appt.patient.fullName}</span>
            <span className="board-block__status">{statusLabel(appt.status)}</span>
            {highRisk && (
              <span
                className="board-block__risk"
                title={`No-show risk ${(risk.score * 100).toFixed(0)}%\n${risk.factors.join('\n')}`}
              >
                ⚠ {(risk.score * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ) : bookable ? (
          <div
            className={`board__cell--empty${dragId ? ' board__cell--target' : ''}`}
            onDragOver={(e) => {
              if (dragId) e.preventDefault();
            }}
            onDrop={(e) => onDrop(e, time)}
          />
        ) : (
          <div className="board__cell--offhours" title="Outside clinic hours — not bookable" />
        )}
      </div>
    </div>
  );
}
