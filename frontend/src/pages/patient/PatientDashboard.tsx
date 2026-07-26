import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAppointmentsStore } from '../../store/appointments';
import { useNotificationsStore, notificationText } from '../../store/notifications';
import { updateAppointment } from '../../api/appointments';
import type { AppointmentDto } from '../../types';
import { clinicHour, fmtDateTime, getErrorMessage, hoursUntil } from '../../utils';
import { StatusBadge } from '../../components/Badge';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import IntakeChat from '../../components/IntakeChat';
import { IconChat, IconClock } from '../../components/Icons';
import { toast } from '../../store/toasts';

function greeting(): string {
  const h = clinicHour(new Date().toISOString());
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Human-friendly countdown, e.g. "in 3 days", "in 5 hours", "in 40 minutes". */
function countdown(iso: string): string {
  const hours = hoursUntil(iso);
  if (hours >= 48) return `in ${Math.round(hours / 24)} days`;
  if (hours >= 1.5) return `in ${Math.round(hours)} hours`;
  const minutes = Math.max(1, Math.round(hours * 60));
  return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const { items, loading, error, fetch } = useAppointmentsStore();
  const notifications = useNotificationsStore((s) => s.items);
  const [intakeFor, setIntakeFor] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const upcoming = useMemo(
    () =>
      items
        .filter(
          (a) =>
            (a.status === 'scheduled' || a.status === 'checked_in') &&
            new Date(a.endTime).getTime() > Date.now(),
        )
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [items],
  );

  // Live-updating via socket `appointment.updated` → appointments store upsert.
  const intakeCandidate = upcoming.find((a) => {
    const h = hoursUntil(a.startTime);
    return h > 0 && h <= 24;
  });

  const cancel = async (appt: AppointmentDto) => {
    if (!window.confirm('Cancel this appointment?')) return;
    setCancellingId(appt.id);
    try {
      const updated = await updateAppointment(appt.id, { status: 'cancelled' });
      useAppointmentsStore.getState().upsert(updated);
      toast('Appointment cancelled.', 'success');
    } catch (err) {
      toast(getErrorMessage(err), 'error');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="page">
      <div className="hero-card">
        <div>
          <h2>
            {greeting()}, {user?.fullName.split(' ')[0]}
          </h2>
          <p className="hero-card__sub">Here is what is coming up for you.</p>
          {upcoming.length > 0 && (
            <span className="hero-card__countdown">
              <IconClock size={15} />
              Next appointment {countdown(upcoming[0].startTime)} — {upcoming[0].doctor.fullName},{' '}
              {fmtDateTime(upcoming[0].startTime)}
            </span>
          )}
        </div>
        <Link to="/patient/book">
          <Button>Book an appointment</Button>
        </Link>
      </div>

      {intakeCandidate && (
        <div className="intake-cta">
          <div className="intake-cta__icon">
            <IconChat size={24} />
          </div>
          <div className="intake-cta__text">
            <strong>Your appointment with {intakeCandidate.doctor.fullName} is coming up.</strong>
            <span>
              Complete your pre-visit intake now so your doctor is prepared —{' '}
              {fmtDateTime(intakeCandidate.startTime)}.
            </span>
          </div>
          <Button onClick={() => setIntakeFor(intakeCandidate.id)}>
            Complete pre-visit intake
          </Button>
        </div>
      )}

      <div className="grid-2">
        <section className="card">
          <h3 className="card__title">Upcoming appointments</h3>
          {loading && <Spinner block label="Loading appointments…" />}
          {error && <p className="inline-error">{error}</p>}
          {!loading && !error && upcoming.length === 0 && (
            <EmptyState
              title="No upcoming appointments"
              message="Book your next visit in a couple of clicks."
              action={
                <Link to="/patient/book">
                  <Button variant="secondary">Book now</Button>
                </Link>
              }
            />
          )}
          <ul className="appt-list">
            {upcoming.map((a) => (
              <li key={a.id} className="appt-item">
                <div className="appt-item__main">
                  <span className="appt-item__doctor">{a.doctor.fullName}</span>
                  <span className="appt-item__meta">
                    {a.doctor.specialty} · {fmtDateTime(a.startTime)}
                  </span>
                  {a.reason && <span className="appt-item__reason">{a.reason}</span>}
                </div>
                <div className="appt-item__side">
                  <StatusBadge status={a.status} />
                  {a.status === 'scheduled' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={cancellingId === a.id}
                      onClick={() => void cancel(a)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3 className="card__title">Notifications</h3>
          {notifications.length === 0 ? (
            <EmptyState title="Nothing new" message="Notifications will show up here." />
          ) : (
            <ul className="notif-list">
              {notifications.slice(0, 8).map((n) => (
                <li key={n.id} className={n.read ? '' : 'notif-list__unread'}>
                  <span>{notificationText(n)}</span>
                  <span className="notif-list__time">{fmtDateTime(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {intakeFor && <IntakeChat appointmentId={intakeFor} onClose={() => setIntakeFor(null)} />}
    </div>
  );
}
