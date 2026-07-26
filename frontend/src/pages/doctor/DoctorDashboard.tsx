import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppointmentsStore } from '../../store/appointments';
import { getTriage } from '../../api/ai';
import type { TriageSummary } from '../../types';
import { fmtTime, todayStr } from '../../utils';
import { StatusBadge } from '../../components/Badge';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import Modal from '../../components/Modal';
import TriageSummaryCard from '../../components/TriageSummaryCard';

export default function DoctorDashboard() {
  const { items, loading, error, fetch } = useAppointmentsStore();
  const [triageMap, setTriageMap] = useState<Record<string, TriageSummary>>({});
  const [openTriageId, setOpenTriageId] = useState<string | null>(null);

  const today = todayStr();

  useEffect(() => {
    void fetch({ date: today });
  }, [fetch, today]);

  const todays = useMemo(
    () =>
      items
        .filter((a) => a.startTime.slice(0, 10) === today || a.startTime.startsWith(today))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [items, today],
  );

  // Fetch triage summaries for today's appointments (404 = none submitted).
  useEffect(() => {
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
  }, [todays, triageMap]);

  const openTriage = openTriageId ? triageMap[openTriageId] : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Today's appointments</h2>
          <p className="page-subtitle">
            {new Date().toLocaleDateString([], {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: 'Asia/Karachi',
            })}
          </p>
        </div>
      </div>

      {loading && <Spinner block label="Loading schedule…" />}
      {error && <p className="inline-error">{error}</p>}
      {!loading && !error && todays.length === 0 && (
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
