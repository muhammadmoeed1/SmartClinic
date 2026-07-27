import { useEffect, useMemo, useState } from 'react';
import type { WaitlistListEntryDto } from '../../types';
import { getWaitlist, notifyWaitlistEntry } from '../../api/appointments';
import { fmtDate, getErrorMessage } from '../../utils';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import { toast } from '../../store/toasts';

export default function ReceptionWaitlist() {
  const [entries, setEntries] = useState<WaitlistListEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getWaitlist()
      .then(setEntries)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const byDate = useMemo(() => {
    if (!entries) return [];
    const map = new Map<string, WaitlistListEntryDto[]>();
    for (const e of entries) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  const notify = async (entry: WaitlistListEntryDto) => {
    setNotifyingId(entry.id);
    try {
      await notifyWaitlistEntry(entry.id);
      toast(`Notified ${entry.patient.fullName}.`, 'success');
      setEntries((prev) => (prev ? prev.filter((e) => e.id !== entry.id) : prev));
    } catch (err) {
      toast(getErrorMessage(err), 'error');
    } finally {
      setNotifyingId(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Waitlist</h2>
          <p className="page-subtitle">
            Patients waiting for a slot to open up — notify them as soon as one does.
          </p>
        </div>
      </div>

      {loading && <Spinner block label="Loading waitlist…" />}
      {error && <p className="inline-error">{error}</p>}
      {!loading && entries && entries.length === 0 && (
        <EmptyState title="Nobody waiting" message="The waitlist is currently empty." />
      )}

      <div className="stack">
        {byDate.map(([date, dayEntries]) => (
          <div key={date} className="card">
            <h4 className="card__title">{fmtDate(`${date}T00:00:00`)}</h4>
            <div className="waitlist-rows">
              {dayEntries.map((e, idx) => (
                <div key={e.id} className="waitlist-row">
                  <span className="waitlist-row__position">#{idx + 1}</span>
                  <div className="waitlist-row__info">
                    <strong>{e.patient.fullName}</strong>
                    <span className="muted">
                      {e.patient.phone && `${e.patient.phone} · `}
                      waiting for {e.doctor.fullName}
                      {e.doctor.specialty && ` (${e.doctor.specialty})`}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={notifyingId === e.id}
                    onClick={() => void notify(e)}
                  >
                    Notify
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
