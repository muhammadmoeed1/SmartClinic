import { useEffect, useState } from 'react';
import type { VisitRecordDto } from '../../types';
import { getRecords } from '../../api/records';
import { fmtDate, getErrorMessage } from '../../utils';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import RecordDetail from '../../components/RecordDetail';
import Badge from '../../components/Badge';

export default function PatientRecords() {
  const [records, setRecords] = useState<VisitRecordDto[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecords()
      .then((r) => {
        const sorted = [...r].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setRecords(sorted);
        if (sorted.length > 0) setSelectedId(sorted[0].id);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const selected = records?.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>My medical records</h2>
          <p className="page-subtitle">Visit notes and files shared by your doctors.</p>
        </div>
      </div>
      {loading && <Spinner block label="Loading records…" />}
      {error && <p className="inline-error">{error}</p>}
      {records && records.length === 0 && (
        <EmptyState
          title="No records yet"
          message="After your visits, your doctor's notes will appear here."
        />
      )}
      {records && records.length > 0 && (
        <div className="records-layout">
          <ul className="records-list card">
            {records.map((r) => (
              <li
                key={r.id}
                className={`records-list__item ${r.id === selectedId ? 'records-list__item--active' : ''}`}
                onClick={() => setSelectedId(r.id)}
              >
                <div className="records-list__col">
                  <span>{fmtDate(r.appointment?.startTime ?? r.createdAt)}</span>
                  {r.doctor && <span className="muted records-list__sub">{r.doctor.fullName}</span>}
                </div>
                {r.finalized ? <Badge tone="green">Finalized</Badge> : <Badge tone="amber">Draft</Badge>}
              </li>
            ))}
          </ul>
          <div className="card records-detail">
            {selected ? (
              <RecordDetail record={selected} />
            ) : (
              <EmptyState title="Select a visit" message="Choose a visit on the left." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
