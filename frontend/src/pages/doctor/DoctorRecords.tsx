import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { VisitRecordDto } from '../../types';
import { getRecords } from '../../api/records';
import { fmtDate, getErrorMessage } from '../../utils';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import RecordDetail from '../../components/RecordDetail';
import Badge from '../../components/Badge';
import Button from '../../components/Button';

interface PatientGroup {
  patientId: string;
  patientName: string;
  records: VisitRecordDto[];
}

export default function DoctorRecords() {
  const [records, setRecords] = useState<VisitRecordDto[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecords()
      .then((r) => setRecords([...r].sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!records) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        (r.patient?.fullName ?? '').toLowerCase().includes(q) ||
        r.icdCodes.some((c) => c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)),
    );
  }, [records, filter]);

  const groups = useMemo<PatientGroup[]>(() => {
    const map = new Map<string, VisitRecordDto[]>();
    for (const r of filtered) {
      if (!map.has(r.patientId)) map.set(r.patientId, []);
      map.get(r.patientId)!.push(r);
    }
    return [...map.entries()]
      .map(([patientId, recs]) => ({
        patientId,
        patientName: recs[0].patient?.fullName ?? `Unknown patient (${patientId.slice(0, 8)}…)`,
        records: recs,
      }))
      .sort((a, b) => a.patientName.localeCompare(b.patientName));
  }, [filtered]);

  const selected = filtered.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Patient records</h2>
          <p className="page-subtitle">Visit notes for patients under your care, grouped by patient.</p>
        </div>
        <input
          className="input input--search"
          placeholder="Search by patient name or ICD code…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {loading && <Spinner block label="Loading records…" />}
      {error && <p className="inline-error">{error}</p>}
      {records && records.length === 0 && (
        <EmptyState
          title="No records yet"
          message="Records you create during visits will appear here."
        />
      )}

      {records && records.length > 0 && (
        <div className="records-layout">
          <div className="records-list card">
            {groups.map((g) => (
              <details key={g.patientId} className="records-group" open={groups.length <= 5}>
                <summary className="records-group__summary">
                  <span>{g.patientName}</span>
                  <span className="muted records-group__count">
                    {g.records.length} visit{g.records.length === 1 ? '' : 's'}
                  </span>
                </summary>
                <ul className="records-group__list">
                  {g.records.map((r) => (
                    <li
                      key={r.id}
                      className={`records-list__item ${r.id === selectedId ? 'records-list__item--active' : ''}`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <span>{fmtDate(r.appointment?.startTime ?? r.createdAt)}</span>
                      {r.finalized ? <Badge tone="green">Finalized</Badge> : <Badge tone="amber">Draft</Badge>}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            {groups.length === 0 && <p className="muted records-list__none">No matches.</p>}
          </div>
          <div className="card records-detail">
            {selected ? (
              <div className="stack">
                <RecordDetail record={selected} />
                {!selected.finalized && (
                  <Link to={`/doctor/visit/${selected.appointmentId}`}>
                    <Button variant="secondary">Edit in visit view</Button>
                  </Link>
                )}
              </div>
            ) : (
              <EmptyState title="Select a record" message="Choose a visit on the left." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
