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
import { StatusBadge } from '../../components/Badge';
import { IconWarning } from '../../components/Icons';
import { toast } from '../../store/toasts';

/** 30-min rows 09:00–17:00. */
const TIMES: string[] = Array.from({ length: 16 }, (_, i) => {
  const h = 9 + Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

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
    void fetch({ date });
  }, [fetch, date]);

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

  // Current-time indicator row (only when viewing today).
  const nowKey = (() => {
    if (date !== todayStr()) return null;
    const key = nowSlotKey();
    return TIMES.includes(key) ? key : null;
  })();

  // Live board: socket appointment.updated/checkin events upsert into the store.
  const dayAppointments = useMemo(
    () =>
      items.filter(
        (a) => toDateStr(new Date(a.startTime)) === date && a.status !== 'cancelled',
      ),
    [items, date],
  );

  const byCell = useMemo(() => {
    const map = new Map<string, AppointmentDto>();
    for (const a of dayAppointments) {
      map.set(`${a.doctorId}|${localTimeKey(a.startTime)}`, a);
    }
    return map;
  }, [dayAppointments]);

  const detailLive = detail ? (items.find((a) => a.id === detail.id) ?? detail) : null;

  const onDrop = (e: DragEvent, doctorId: string, time: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDragId(null);
    const appt = items.find((a) => a.id === id);
    if (!appt || appt.doctorId !== doctorId) return;
    if (byCell.has(`${doctorId}|${time}`)) return;
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

  return (
    <div className="page page--full">
      <div className="page-header">
        <div>
          <h2>Booking board</h2>
          <p className="page-subtitle">
            Live daily calendar — drag a scheduled appointment to reschedule it (same doctor).
          </p>
        </div>
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {doctorsError && <p className="inline-error">{doctorsError}</p>}
      {error && <p className="inline-error">{error}</p>}
      {(loading || !doctors) && !doctorsError && <Spinner block label="Loading board…" />}

      {doctors && !loading && (
        <div className="board-scroll">
          <div
            className="board"
            style={{ gridTemplateColumns: `72px repeat(${doctors.length}, minmax(150px, 1fr))` }}
          >
            <div className="board__corner" />
            {doctors.map((d) => (
              <div key={d.id} className="board__doctor">
                <strong>{d.fullName}</strong>
                <span className="muted">{d.specialty}</span>
              </div>
            ))}
            {TIMES.map((time) => (
              <BoardRow
                key={time}
                time={time}
                isNow={time === nowKey}
                doctors={doctors}
                byCell={byCell}
                risks={risks}
                dragId={dragId}
                setDragId={setDragId}
                onDrop={onDrop}
                onOpen={setDetail}
              />
            ))}
          </div>
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

function BoardRow({
  time,
  isNow,
  doctors,
  byCell,
  risks,
  dragId,
  setDragId,
  onDrop,
  onOpen,
}: {
  time: string;
  isNow: boolean;
  doctors: DoctorDto[];
  byCell: Map<string, AppointmentDto>;
  risks: Record<string, NoShowRiskDto>;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDrop: (e: DragEvent, doctorId: string, time: string) => void;
  onOpen: (a: AppointmentDto) => void;
}) {
  const nowCls = isNow ? ' board__cell--now' : '';
  return (
    <>
      <div className={`board__time${isNow ? ' board__time--now' : ''}`}>{time}</div>
      {doctors.map((d) => {
        const appt = byCell.get(`${d.id}|${time}`);
        if (appt) {
          const risk = risks[appt.id];
          const highRisk = risk && risk.score > RISK_THRESHOLD;
          return (
            <div key={d.id} className={`board__cell${nowCls}`}>
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
            </div>
          );
        }
        const droppable = dragId !== null;
        return (
          <div
            key={d.id}
            className={`board__cell board__cell--empty${nowCls} ${droppable ? 'board__cell--target' : ''}`}
            onDragOver={(e) => {
              if (dragId) e.preventDefault();
            }}
            onDrop={(e) => onDrop(e, d.id, time)}
          />
        );
      })}
    </>
  );
}
