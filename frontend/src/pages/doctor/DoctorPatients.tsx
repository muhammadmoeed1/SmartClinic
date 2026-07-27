import { useEffect, useMemo, useState } from 'react';
import { useAppointmentsStore } from '../../store/appointments';
import type { AppointmentDto } from '../../types';
import { fmtDateTime, hoursUntil } from '../../utils';
import { StatusBadge } from '../../components/Badge';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import { IconSearch } from '../../components/Icons';

interface PatientSummary {
  patientId: string;
  fullName: string;
  phone: string | null;
  visits: AppointmentDto[]; // sorted newest-first
}

export default function DoctorPatients() {
  const { items, loading, error, fetch } = useAppointmentsStore();
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    void fetch({});
  }, [fetch]);

  const patients = useMemo<PatientSummary[]>(() => {
    const map = new Map<string, PatientSummary>();
    for (const a of items) {
      if (!map.has(a.patientId)) {
        map.set(a.patientId, {
          patientId: a.patientId,
          fullName: a.patient.fullName,
          phone: a.patient.phone,
          visits: [],
        });
      }
      map.get(a.patientId)!.visits.push(a);
    }
    for (const p of map.values()) p.visits.sort((a, b) => b.startTime.localeCompare(a.startTime));
    return [...map.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.fullName.toLowerCase().includes(q));
  }, [patients, query]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>My patients</h2>
          <p className="page-subtitle">Everyone you have an appointment with, past or upcoming.</p>
        </div>
        <div className="input-icon">
          <IconSearch size={16} />
          <input
            className="input input--search"
            placeholder="Search by patient name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading && <Spinner block label="Loading patients…" />}
      {error && <p className="inline-error">{error}</p>}
      {!loading && patients.length === 0 && (
        <EmptyState title="No patients yet" message="Patients you see will appear here." />
      )}
      {!loading && patients.length > 0 && filtered.length === 0 && (
        <p className="muted">No patients match "{query}".</p>
      )}

      <div className="stack">
        {filtered.map((p) => {
          const next = p.visits.find((v) => hoursUntil(v.startTime) > 0 && v.status === 'scheduled');
          const last = p.visits.find((v) => hoursUntil(v.startTime) <= 0);
          const open = expandedId === p.patientId;
          return (
            <div key={p.patientId} className="card patient-card">
              <div
                className="patient-card__header"
                onClick={() => setExpandedId(open ? null : p.patientId)}
              >
                <div>
                  <strong>{p.fullName}</strong>
                  {p.phone && <span className="muted"> · {p.phone}</span>}
                </div>
                <div className="patient-card__summary muted">
                  {next && <span>Next: {fmtDateTime(next.startTime)}</span>}
                  {!next && last && <span>Last visit: {fmtDateTime(last.startTime)}</span>}
                  <span>{p.visits.length} appointment{p.visits.length === 1 ? '' : 's'}</span>
                </div>
              </div>
              {open && (
                <div className="patient-card__visits">
                  {p.visits.map((v) => (
                    <div key={v.id} className="patient-visit-row">
                      <span>{fmtDateTime(v.startTime)}</span>
                      {v.reason && <span className="muted">{v.reason}</span>}
                      <StatusBadge status={v.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
