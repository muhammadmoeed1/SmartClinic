import { useEffect, useState, type ReactNode } from 'react';
import type { HealthResponse, SystemHealthSummary } from '../../types';
import { getHealth, getSystemHealth } from '../../api/system';
import { getErrorMessage } from '../../utils';
import Spinner from '../../components/Spinner';
import Button from '../../components/Button';
import { IconActivity, IconClock, IconStethoscope, IconWarning } from '../../components/Icons';

const REFRESH_MS = 15_000;

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AdminHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [summary, setSummary] = useState<SystemHealthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const load = () => {
    Promise.all([getHealth(), getSystemHealth()])
      .then(([h, s]) => {
        setHealth(h);
        setSummary(s);
        setError(null);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => {
        setLoading(false);
        setLastChecked(new Date());
      });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const healthy = health?.status === 'ok';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>System health</h2>
          <p className="page-subtitle">
            Live backend status — refreshes automatically every {REFRESH_MS / 1000}s.
          </p>
        </div>
        <Button variant="secondary" onClick={load}>
          Refresh now
        </Button>
      </div>

      {loading && <Spinner block label="Checking system health…" />}
      {error && <p className="inline-error">{error}</p>}

      {health && summary && (
        <>
          <div className={`health-banner ${healthy ? 'health-banner--ok' : 'health-banner--degraded'}`}>
            <span className={`health-dot ${healthy ? 'health-dot--ok' : 'health-dot--degraded'}`} />
            <span>
              <strong>{healthy ? 'All systems operational' : 'Degraded'}</strong>
              {' · '}Database: {health.db}
            </span>
            {lastChecked && (
              <span className="muted health-banner__time">
                Checked {lastChecked.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="stat-row">
            <StatCard
              label="Process uptime"
              value={formatDuration(summary.uptimeSeconds)}
              caption={`Node ${summary.nodeVersion}`}
              icon={<IconClock size={20} />}
              tone="teal"
            />
            <StatCard
              label="Total requests served"
              value={summary.totalRequests.toLocaleString()}
              caption="Since process start"
              icon={<IconActivity size={20} />}
              tone="blue"
            />
            <StatCard
              label="Memory usage"
              value={`${summary.memoryMb} MB`}
              caption="Resident set size"
              icon={<IconStethoscope size={20} />}
              tone="violet"
            />
            <StatCard
              label="Event loop lag"
              value={`${summary.eventLoopLagMs} ms`}
              caption={`${summary.cpuSeconds}s CPU time used`}
              icon={<IconWarning size={20} />}
              tone="amber"
            />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  caption,
  icon,
  tone,
}: {
  label: string;
  value: string;
  caption?: string;
  icon: ReactNode;
  tone: 'teal' | 'blue' | 'amber' | 'violet';
}) {
  return (
    <div className="stat-card">
      <span className={`stat-card__icon ${tone === 'teal' ? '' : `stat-card__icon--${tone}`}`}>{icon}</span>
      <span className="stat-card__body">
        <span className="stat-card__value">{value}</span>
        <span className="stat-card__label">{label}</span>
        {caption && <span className="stat-card__caption">{caption}</span>}
      </span>
    </div>
  );
}
