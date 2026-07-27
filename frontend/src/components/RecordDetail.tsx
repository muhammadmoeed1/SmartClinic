import { useState } from 'react';
import type { VisitRecordDto } from '../types';
import { downloadRecordFile } from '../api/records';
import { fmtDate, formatBytes, getErrorMessage } from '../utils';
import Badge from './Badge';
import Button from './Button';
import { IconDownload, IconPrint } from './Icons';
import { toast } from '../store/toasts';

const SOAP_SECTIONS: Array<{ key: keyof VisitRecordDto & string; label: string }> = [
  { key: 'subjective', label: 'Subjective' },
  { key: 'objective', label: 'Objective' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'plan', label: 'Plan' },
];

export default function RecordDetail({ record }: { record: VisitRecordDto }) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (fileId: string) => {
    const file = record.files.find((f) => f.id === fileId);
    if (!file) return;
    setDownloadingId(fileId);
    try {
      await downloadRecordFile(record.id, file);
    } catch (err) {
      toast(getErrorMessage(err), 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const visitDate = fmtDate(record.appointment?.startTime ?? record.createdAt);
  const title = [
    record.doctor && `Dr. ${record.doctor.fullName.replace(/^Dr\.?\s*/i, '')}`,
    record.patient?.fullName,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="stack">
      <div className="actions-row record-actions">
        <Button variant="ghost" size="sm" onClick={() => window.print()}>
          <IconPrint size={15} /> Print / Save as PDF
        </Button>
      </div>
      <div className="stack record-print">
      <div className="record-header">
        {title && <h3 className="record-header__title">{title}</h3>}
        <div className="record-meta">
          <span className="muted">Visit on {visitDate}</span>
          {record.finalized ? <Badge tone="green">Finalized</Badge> : <Badge tone="amber">Draft</Badge>}
        </div>
      </div>
      {SOAP_SECTIONS.map(({ key, label }) => (
        <div key={key} className="soap-section">
          <h4>{label}</h4>
          <p>{(record[key] as string) || <span className="muted">Not recorded</span>}</p>
        </div>
      ))}
      {record.icdCodes.length > 0 && (
        <div className="soap-section">
          <h4>Diagnosis codes (ICD-10)</h4>
          <div className="chip-row">
            {record.icdCodes.map((c) => (
              <span key={c.code} className="chip" title={c.description}>
                <strong>{c.code}</strong> {c.description}
              </span>
            ))}
          </div>
        </div>
      )}
      {record.files.length > 0 && (
        <div className="soap-section">
          <h4>Attached files</h4>
          <ul className="file-list">
            {record.files.map((f) => (
              <li key={f.id}>
                <span>
                  {f.filename} <span className="muted">({formatBytes(f.size)})</span>
                </span>
                <button
                  className="icon-btn"
                  onClick={() => void download(f.id)}
                  disabled={downloadingId === f.id}
                  aria-label={`Download ${f.filename}`}
                >
                  <IconDownload size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
    </div>
  );
}
