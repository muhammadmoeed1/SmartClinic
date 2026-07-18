import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { AppointmentDto, IcdCode, TriageSummary, VisitRecordDto } from '../../types';
import { getAppointment, updateAppointment } from '../../api/appointments';
import { createRecord, getRecords, updateRecord, uploadRecordFile } from '../../api/records';
import { getTriage, soapFormat } from '../../api/ai';
import {
  fmtDateTime,
  formatBytes,
  getErrorMessage,
  isAiFallback,
  isPreauthBlocked,
} from '../../utils';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import Badge, { StatusBadge } from '../../components/Badge';
import TriageSummaryCard from '../../components/TriageSummaryCard';
import { downloadRecordFile } from '../../api/records';
import { IconCheck, IconDownload, IconWarning, IconX } from '../../components/Icons';
import { toast } from '../../store/toasts';
import { useAppointmentsStore } from '../../store/appointments';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];

export default function VisitView() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [appointment, setAppointment] = useState<AppointmentDto | null>(null);
  const [record, setRecord] = useState<VisitRecordDto | null>(null);
  const [triage, setTriage] = useState<TriageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // SOAP editor state
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [icdCodes, setIcdCodes] = useState<IcdCode[]>([]);
  const [rawNotes, setRawNotes] = useState('');
  const [suggestions, setSuggestions] = useState<IcdCode[]>([]);

  const [formatting, setFormatting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [preauthBlocked, setPreauthBlocked] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!appointmentId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const appt = await getAppointment(appointmentId);
        if (cancelled) return;
        setAppointment(appt);
        const records = await getRecords(appt.patientId);
        if (cancelled) return;
        const existing = records.find((r) => r.appointmentId === appointmentId) ?? null;
        if (existing) applyRecord(existing);
      } catch (err) {
        if (!cancelled) setLoadError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // Triage summary is optional (404 when none exists).
    getTriage(appointmentId)
      .then((t) => {
        if (!cancelled) setTriage(t.summary);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
     
  }, [appointmentId]);

  function applyRecord(r: VisitRecordDto) {
    setRecord(r);
    setSubjective(r.subjective ?? '');
    setObjective(r.objective ?? '');
    setAssessment(r.assessment ?? '');
    setPlan(r.plan ?? '');
    setIcdCodes(r.icdCodes ?? []);
  }

  const setStatus = async (status: 'in_progress' | 'completed') => {
    if (!appointment) return;
    setStatusUpdating(true);
    try {
      const updated = await updateAppointment(appointment.id, { status });
      setAppointment(updated);
      useAppointmentsStore.getState().upsert(updated);
      toast(status === 'in_progress' ? 'Consultation started.' : 'Consultation completed.', 'success');
    } catch (err) {
      toast(getErrorMessage(err), 'error');
    } finally {
      setStatusUpdating(false);
    }
  };

  const formatWithAi = async () => {
    if (!rawNotes.trim()) {
      toast('Write some raw notes first.', 'info');
      return;
    }
    setFormatting(true);
    try {
      const res = await soapFormat(rawNotes.trim());
      setSubjective(res.subjective);
      setObjective(res.objective);
      setAssessment(res.assessment);
      setPlan(res.plan);
      setSuggestions(
        res.icdSuggestions.slice(0, 3).filter((s) => !icdCodes.some((c) => c.code === s.code)),
      );
      toast('Notes formatted — review and edit before saving.', 'success');
    } catch (err) {
      if (isAiFallback(err)) {
        toast('AI formatting is unavailable right now — you can keep editing manually.', 'error');
      } else {
        toast(getErrorMessage(err), 'error');
      }
    } finally {
      setFormatting(false);
    }
  };

  const acceptSuggestion = (s: IcdCode) => {
    setIcdCodes((codes) => (codes.some((c) => c.code === s.code) ? codes : [...codes, s]));
    setSuggestions((sug) => sug.filter((x) => x.code !== s.code));
  };

  const dismissSuggestion = (s: IcdCode) => {
    setSuggestions((sug) => sug.filter((x) => x.code !== s.code));
  };

  const removeIcd = (code: string) => {
    setIcdCodes((codes) => codes.filter((c) => c.code !== code));
  };

  const save = async (): Promise<VisitRecordDto | null> => {
    if (!appointment) return null;
    setSaving(true);
    try {
      const fields = { subjective, objective, assessment, plan, icdCodes };
      const saved = record
        ? await updateRecord(record.id, fields)
        : await createRecord({ appointmentId: appointment.id, ...fields });
      applyRecord(saved);
      toast('Record saved.', 'success');
      return saved;
    } catch (err) {
      toast(getErrorMessage(err), 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    if (!appointment) return;
    setFinalizing(true);
    setPreauthBlocked(false);
    try {
      // Make sure the latest edits are persisted (creates the record if needed).
      const fields = { subjective, objective, assessment, plan, icdCodes };
      const base = record ?? (await createRecord({ appointmentId: appointment.id, ...fields }));
      const finalized = await updateRecord(base.id, { ...fields, finalize: true });
      applyRecord(finalized);
      toast('Record finalized.', 'success');
    } catch (err) {
      if (isPreauthBlocked(err)) {
        setPreauthBlocked(true);
      } else {
        toast(getErrorMessage(err), 'error');
      }
    } finally {
      setFinalizing(false);
    }
  };

  const onFilePicked = async (file: File | undefined) => {
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      toast('Only PDF, PNG or JPEG files are allowed.', 'error');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast('File is larger than 5 MB.', 'error');
      return;
    }
    let target = record;
    if (!target) {
      target = await save();
      if (!target) return;
    }
    setUploading(true);
    try {
      await uploadRecordFile(target.id, file);
      // refresh files list
      const refreshed = await getRecords(appointment?.patientId);
      const updated = refreshed.find((r) => r.id === target?.id);
      if (updated) applyRecord(updated);
      toast('File uploaded.', 'success');
    } catch (err) {
      toast(getErrorMessage(err), 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) return <Spinner block size={30} label="Loading visit…" />;
  if (loadError) return <p className="inline-error">{loadError}</p>;
  if (!appointment) return null;

  const readOnly = record?.finalized === true;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Visit — {appointment.patient.fullName}</h2>
          <p className="page-subtitle">
            {fmtDateTime(appointment.startTime)}
            {appointment.reason ? ` · ${appointment.reason}` : ''}
          </p>
        </div>
        <div className="visit-status">
          <StatusBadge status={appointment.status} />
          {(appointment.status === 'scheduled' || appointment.status === 'checked_in') && (
            <Button loading={statusUpdating} onClick={() => void setStatus('in_progress')}>
              Start consultation
            </Button>
          )}
          {appointment.status === 'in_progress' && (
            <Button loading={statusUpdating} onClick={() => void setStatus('completed')}>
              Complete consultation
            </Button>
          )}
        </div>
      </div>

      {preauthBlocked && (
        <div className="warning-banner">
          <IconWarning size={20} />
          <div>
            <strong>Insurance pre-auth not approved yet.</strong> This specialist visit cannot be
            finalized until the insurance pre-authorization is approved. Ask reception to follow up
            in the pre-auth tracker, then try again.
          </div>
        </div>
      )}

      <div className="visit-layout">
        <div className="stack visit-main">
          {triage && (
            <section className="card">
              <h3 className="card__title">Patient intake (pre-consultation)</h3>
              <TriageSummaryCard summary={triage} />
            </section>
          )}

          <section className="card stack">
            <div className="card-title-row">
              <h3 className="card__title">SOAP note</h3>
              {readOnly && <Badge tone="green">Finalized — read only</Badge>}
            </div>

            {!readOnly && (
              <div className="raw-notes">
                <label className="form-group">
                  <span>Raw notes</span>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Jot down shorthand notes, then let AI structure them…"
                    value={rawNotes}
                    onChange={(e) => setRawNotes(e.target.value)}
                  />
                </label>
                <Button className="btn--ai" loading={formatting} onClick={() => void formatWithAi()}>
                  ✦ Format with AI
                </Button>
              </div>
            )}

            {suggestions.length > 0 && !readOnly && (
              <div className="suggestions">
                <span className="suggestions__title">✦ AI ICD-10 suggestions</span>
                <div className="chip-row">
                  {suggestions.map((s) => (
                    <span key={s.code} className="chip chip--suggestion">
                      <strong>{s.code}</strong> {s.description}
                      <button
                        className="chip__action"
                        onClick={() => acceptSuggestion(s)}
                        aria-label={`Accept ${s.code}`}
                      >
                        <IconCheck size={12} /> Accept
                      </button>
                      <button
                        className="chip__action chip__action--dismiss"
                        onClick={() => dismissSuggestion(s)}
                        aria-label={`Dismiss ${s.code}`}
                        title="Dismiss"
                      >
                        <IconX size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(
              [
                ['Subjective', subjective, setSubjective],
                ['Objective', objective, setObjective],
                ['Assessment', assessment, setAssessment],
                ['Plan', plan, setPlan],
              ] as Array<[string, string, (v: string) => void]>
            ).map(([label, value, setter]) => (
              <div key={label} className={`soap-panel soap-panel--${label[0].toLowerCase()}`}>
                <span className="soap-panel__letter" aria-hidden="true">
                  {label[0]}
                </span>
                <label className="form-group">
                  <span>{label}</span>
                  <textarea
                    className="input"
                    rows={3}
                    value={value}
                    readOnly={readOnly}
                    onChange={(e) => setter(e.target.value)}
                  />
                </label>
              </div>
            ))}

            <div className="form-group">
              <span>Diagnosis codes (ICD-10)</span>
              {icdCodes.length === 0 ? (
                <p className="muted">No codes added yet.</p>
              ) : (
                <div className="chip-row">
                  {icdCodes.map((c) => (
                    <span key={c.code} className="chip" title={c.description}>
                      <strong>{c.code}</strong> {c.description}
                      {!readOnly && (
                        <button
                          className="chip__action chip__action--dismiss"
                          onClick={() => removeIcd(c.code)}
                          aria-label={`Remove ${c.code}`}
                        >
                          <IconX size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {!readOnly && (
              <div className="actions-row">
                <Button loading={saving} onClick={() => void save()}>
                  Save
                </Button>
                <Button variant="secondary" loading={finalizing} onClick={() => void finalize()}>
                  Finalize
                </Button>
              </div>
            )}
          </section>
        </div>

        <div className="stack visit-side">
          <section className="card stack">
            <h3 className="card__title">Files</h3>
            {!readOnly && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  style={{ display: 'none' }}
                  onChange={(e) => void onFilePicked(e.target.files?.[0])}
                />
                <Button
                  variant="secondary"
                  loading={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload file (PDF / image, max 5 MB)
                </Button>
              </>
            )}
            {record && record.files.length > 0 ? (
              <ul className="file-list">
                {record.files.map((f) => (
                  <li key={f.id}>
                    <span>
                      {f.filename} <span className="muted">({formatBytes(f.size)})</span>
                    </span>
                    <button
                      className="icon-btn"
                      aria-label={`Download ${f.filename}`}
                      onClick={() => record && void downloadRecordFile(record.id, f)}
                    >
                      <IconDownload size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No files attached.</p>
            )}
          </section>

          <section className="card">
            <h3 className="card__title">Patient</h3>
            <p>
              <strong>{appointment.patient.fullName}</strong>
            </p>
            <p className="muted">{appointment.patient.phone ?? 'No phone on file'}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
