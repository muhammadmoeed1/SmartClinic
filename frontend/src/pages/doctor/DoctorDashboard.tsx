import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppointmentsStore } from '../../store/appointments';
import { getTriage } from '../../api/ai';
import type { AppointmentDto, TriageSummary } from '../../types';
import { fmtDate, fmtTime, todayStr, toDateStr } from '../../utils';
import { StatusBadge } from '../../components/Badge';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import Modal from '../../components/Modal';
import TriageSummaryCard from '../../components/TriageSummaryCard';

type View = 'today' | 'upcoming';

export default function DoctorDashboard() {
  const [view, setView] = useState<View>('today');
  const { items, loading, error, fetch } = useAppointmentsStore();
  const [triageMap, setTriageMap] = useState<Record<string, TriageSummary>>({});
  const [openTriageId, setOpenTriageId] = useState<string | null>(null);

  const today = todayStr();

  useEffect(() => {
    void fetch(view === 'today' ? { date: today } : { from: today });
  }, [fetch, today, view]);

  const todays = useMemo(
    () =>
      items
        .filter((a) => toDateStr(new Date(a.startTime)) === today && a.status !== 'cancelled')
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [items, today],
  );

  const upcomingByDate = useMemo(() => {
    if (view !== 'upcoming') return [];
    const future = items.filter(
      (a) => toDateStr(new Date(a.startTime)) > today && a.status !== 'cancelled',
    );
    const map = new Map<string, AppointmentDto[]>();
    for (const a of future) {
      const d = toDateStr(new Date(a.startTime));
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(a);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, appts]) => [date, appts.sort((a, b) => a.startTime.localeCompare(b.startTime))] as const);
  }, [items, today, view]);

  // Fetch triage summaries for today's appointments (404 = none submitted).
  useEffect(() => {
    if (view !== 'today') return;
    let cancelled = false;
    const missing = todays.filter((a) => !(a.id in triageMap));
    if (missing.length === 0) return;
    void Promise.allSettled(missing.map((a) => getTriage(a.id).then((t) => [a.id, t.summary] as const))).then(
      (results) => {
        if (cancelled) return;
        const found = results
          .filter(
            (r): r is PromiseFulfilledResult<readonly [string, TriageSummary]> =>
              r.status === 'fulfilled',
          )
          .map((r) => r.value);
        if (found.length > 0) {
          setTriageMap((prev) => {
            const next = { ...prev };
            for (const [id, summary] of found) next[id] = summary;
            return next;
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [todays, triageMap, view]);

  const openTriage = openTriageId ? triageMap[openTriageId] : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{view === 'today' ? "Today's appointments" : 'Upcoming appointments'}</h2>
          <p className="page-subtitle">
            {view === 'today'
              ? new Date().toLocaleDateString([], {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  timeZone: 'Asia/Karachi',
                })
              : 'Next scheduled visits beyond today'}
          </p>
        </div>
        <div className="segmented">
          {(['today', 'upcoming'] as View[]).map((v) => (
            <button
              key={v}
              className={`segmented__btn ${view === v ? 'segmented__btn--active' : ''}`}
              onClick={() => setView(v)}
            >
              {v === 'today' ? 'Today' : 'Upcoming'}
            </button>
          ))}
        </div>
      </div>

      {loading && <Spinner block label="Loading schedule…" />}
      {error && <p className="inline-error">{error}</p>}

      {view === 'today' && !loading && !error && (
        <>
          {todays.length === 0 && (
            <EmptyState title="No appointments today" message="Enjoy the quiet while it lasts." />
          )}
          <div className="timeline">
            {todays.map((a) => (
              <div key={a.id} className={`timeline-card timeline-card--${a.status}`}>
                <div className="timeline-card__time">
                  {fmtTime(a.startTime)}
                  <span className="muted"> – {fmtTime(a.endTime)}</span>
                </div>
                <div className="timeline-card__body">
                  <div className="timeline-card__patient">
                    <strong>{a.patient.fullName}</strong>
                    {a.reason && <span className="muted"> · {a.reason}</span>}
                  </div>
                  <div className="timeline-card__badges">
                    <StatusBadge status={a.status} />
                    {triageMap[a.id] && (
                      <button className="linklike" onClick={() => setOpenTriageId(a.id)}>
                        <Badge tone="violet">Triage summary</Badge>
                      </button>
                    )}
                  </div>
                </div>
                <div className="timeline-card__actions">
                  <Link to={`/doctor/visit/${a.id}`}>
                    <Button size="sm" variant="secondary">
                      Open visit
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'upcoming' && !loading && !error && (
        <>
          {upcomingByDate.length === 0 && (
            <EmptyState
              title="Nothing coming up"
              message="You have no scheduled appointments after today."
            />
          )}
          <div className="stack">
            {upcomingByDate.map(([date, appts]) => (
              <div key={date} className="card">
                <h4 className="card__title">{fmtDate(`${date}T00:00:00`)}</h4>
                <div className="upcoming-list">
                  {appts.map((a) => (
                    <div key={a.id} className="upcoming-row">
                      <span className="upcoming-row__time">{fmtTime(a.startTime)}</span>
                      <span className="upcoming-row__patient">
                        <strong>{a.patient.fullName}</strong>
                        {a.reason && <span className="muted"> · {a.reason}</span>}
                      </span>
                      <StatusBadge status={a.status} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {openTriage && openTriageId && (
        <Modal title="Pre-consultation triage" onClose={() => setOpenTriageId(null)} wide>
          <TriageSummaryCard summary={openTriage} />
          <div className="actions-row" style={{ marginTop: 16 }}>
            <Link to={`/doctor/visit/${openTriageId}`}>
              <Button>Open visit</Button>
            </Link>
          </div>
        </Modal>
      )}
    </div>
  );
}
