import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ConsultationDurationRow,
  InsuranceStatsRow,
  NoShowTrendRow,
  ObservabilityResponse,
  OccupancyRow,
} from '../../types';
import {
  getConsultationDuration,
  getInsuranceStats,
  getNoShowTrend,
  getOccupancy,
  type OccupancyPeriod,
} from '../../api/analytics';
import { getAppointments } from '../../api/appointments';
import { getObservability } from '../../api/ai';
import { getErrorMessage, todayStr } from '../../utils';
import Button from '../../components/Button';
import Spinner from '../../components/Spinner';
import {
  IconCalendar,
  IconClock,
  IconStethoscope,
  IconWarning,
} from '../../components/Icons';
import { toast } from '../../store/toasts';

type ObsWindow = 24 | 168 | undefined; // 24h, 7 days, all time

// Validated categorical palette (dataviz skill): blue, aqua, yellow.
const C_BLUE = '#2a78d6';
const C_AQUA = '#1baf7a';
const C_YELLOW = '#eda100';
const PIE_COLORS = [C_BLUE, C_AQUA, C_YELLOW];
const GRID = '#e1e0d9';
const MUTED = '#898781';

export default function AdminDashboard() {
  const [period, setPeriod] = useState<OccupancyPeriod>('daily');
  const [occupancy, setOccupancy] = useState<OccupancyRow[] | null>(null);
  const [occupancyLoading, setOccupancyLoading] = useState(true);
  const [trend, setTrend] = useState<NoShowTrendRow[] | null>(null);
  const [duration, setDuration] = useState<ConsultationDurationRow[] | null>(null);
  const [insurance, setInsurance] = useState<InsuranceStatsRow[] | null>(null);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [obs, setObs] = useState<ObservabilityResponse | null>(null);
  const [obsWindow, setObsWindow] = useState<ObsWindow>(24);
  const [obsLoading, setObsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getNoShowTrend(),
      getConsultationDuration(),
      getInsuranceStats(),
      getAppointments({ date: todayStr() }),
    ])
      .then(([t, d, i, appts]) => {
        setTrend(t);
        setDuration(d);
        setInsurance(i);
        setTodayCount(appts.length);
      })
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setObsLoading(true);
    getObservability(obsWindow)
      .then((r) => {
        if (!cancelled) setObs(r);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setObsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [obsWindow]);

  useEffect(() => {
    let cancelled = false;
    setOccupancyLoading(true);
    getOccupancy(period)
      .then((rows) => {
        if (!cancelled) setOccupancy(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setOccupancyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const noShowRate = useMemo(() => {
    if (!trend || trend.length === 0) return null;
    const total = trend.reduce((s, r) => s + r.total, 0);
    const noShows = trend.reduce((s, r) => s + r.noShows, 0);
    return total === 0 ? 0 : (noShows / total) * 100;
  }, [trend]);

  const avgTurnaround = useMemo(() => {
    if (!insurance || insurance.length === 0) return null;
    const totalReqs = insurance.reduce((s, r) => s + r.total, 0);
    if (totalReqs === 0) return 0;
    const weighted = insurance.reduce((s, r) => s + r.avgTurnaroundHours * r.total, 0);
    return weighted / totalReqs;
  }, [insurance]);

  const occupancyChartData = useMemo(
    () =>
      (occupancy ?? []).map((r) => ({
        ...r,
        ratePct: Math.round(r.rate * 100),
      })),
    [occupancy],
  );

  const trendChartData = useMemo(
    () =>
      (trend ?? []).map((r) => ({
        ...r,
        ratePct: Math.round(r.rate * 1000) / 10,
        label: r.date.slice(5), // MM-DD
      })),
    [trend],
  );

  const exportCsv = () => {
    if (!occupancy || occupancy.length === 0) {
      toast('No occupancy data to export.', 'info');
      return;
    }
    const header = 'doctorId,doctorName,specialty,booked,capacity,rate';
    const lines = occupancy.map((r) =>
      [r.doctorId, csvCell(r.doctorName), csvCell(r.specialty), r.booked, r.capacity, r.rate].join(
        ',',
      ),
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `occupancy-${period}-${todayStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Occupancy CSV downloaded.', 'success');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Clinic analytics</h2>
          <p className="page-subtitle">Operational overview across doctors and insurers.</p>
        </div>
        <Button variant="secondary" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      {error && <p className="inline-error">{error}</p>}

      <div className="stat-row">
        <StatCard
          label="Appointments today"
          value={todayCount === null ? '…' : String(todayCount)}
          caption="Across all doctors"
          icon={<IconCalendar size={20} />}
          tone="teal"
        />
        <StatCard
          label="No-show rate (30 days)"
          value={noShowRate === null ? '…' : `${noShowRate.toFixed(1)}%`}
          caption="Trailing 30-day average"
          icon={<IconWarning size={20} />}
          tone="amber"
        />
        <StatCard
          label="Avg approval turnaround"
          value={avgTurnaround === null ? '…' : `${avgTurnaround.toFixed(1)} h`}
          caption="Weighted across insurers"
          icon={<IconClock size={20} />}
          tone="violet"
        />
        <StatCard
          label="Doctors tracked"
          value={occupancy === null ? '…' : String(occupancy.length)}
          caption="With occupancy data"
          icon={<IconStethoscope size={20} />}
          tone="blue"
        />
      </div>

      <div className="chart-grid">
        <section className="card chart-card">
          <div className="card-title-row">
            <h3 className="card__title">Occupancy per doctor</h3>
            <div className="segmented">
              {(['daily', 'weekly'] as OccupancyPeriod[]).map((p) => (
                <button
                  key={p}
                  className={`segmented__btn ${period === p ? 'segmented__btn--active' : ''}`}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          {occupancyLoading ? (
            <Spinner block label="Loading occupancy…" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={occupancyChartData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="doctorName"
                  tick={{ fontSize: 11, fill: MUTED }}
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={48}
                />
                <YAxis
                  unit="%"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: MUTED }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value: number | string) => [`${value}%`, 'Occupancy']}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as (typeof occupancyChartData)[number] | undefined;
                    return row ? `${label} · ${row.specialty} · ${row.booked}/${row.capacity} slots` : label;
                  }}
                />
                <Bar dataKey="ratePct" name="Occupancy" fill={C_BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="card chart-card">
          <h3 className="card__title">No-show trend (last 30 days)</h3>
          {!trend ? (
            <Spinner block label="Loading trend…" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendChartData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: MUTED }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  unit="%"
                  tick={{ fontSize: 11, fill: MUTED }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value: number | string) => [`${value}%`, 'No-show rate']}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as (typeof trendChartData)[number] | undefined;
                    return row ? `${row.date} · ${row.noShows}/${row.total} appointments` : label;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="ratePct"
                  name="No-show rate"
                  stroke={C_BLUE}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="card chart-card">
          <h3 className="card__title">Avg consultation duration by specialty</h3>
          {!duration ? (
            <Spinner block label="Loading durations…" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={duration}
                layout="vertical"
                margin={{ top: 8, right: 32, left: 24, bottom: 4 }}
              >
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis
                  type="number"
                  unit=" min"
                  tick={{ fontSize: 11, fill: MUTED }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="specialty"
                  width={110}
                  tick={{ fontSize: 11, fill: MUTED }}
                  tickLine={false}
                />
                <Tooltip formatter={(value: number | string) => [`${value} min`, 'Avg duration']} />
                <Bar
                  dataKey="avgMinutes"
                  name="Avg duration"
                  fill={C_AQUA}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                  label={{ position: 'right', fontSize: 11, fill: '#52514e' }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="card chart-card">
          <h3 className="card__title">Insurance requests by provider</h3>
          {!insurance ? (
            <Spinner block label="Loading insurance stats…" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={insurance}
                    dataKey="total"
                    nameKey="provider"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                    label={(entry) => `${entry.provider} (${entry.total})`}
                    labelLine={false}
                  >
                    {insurance.map((row, i) => (
                      <Cell key={row.provider} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={24} iconSize={10} />
                  <Tooltip
                    formatter={(value: number | string, _name, entry) => {
                      const row = entry?.payload as InsuranceStatsRow | undefined;
                      return row
                        ? [`${value} requests · ${Math.round(row.approvalRate * 100)}% approved`, row.provider]
                        : [String(value), ''];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="provider-stats">
                {insurance.map((row) => (
                  <div key={row.provider} className="provider-stat">
                    <span className="provider-stat__name">{row.provider}</span>
                    <span className="provider-stat__value">
                      {Math.round(row.approvalRate * 100)}% approved
                    </span>
                    <span className="muted">
                      {row.approved} approved · {row.rejected} rejected · {row.avgTurnaroundHours.toFixed(1)} h
                      turnaround
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-title-row">
          <div>
            <h3 className="card__title">AI observability</h3>
            <p className="page-subtitle" style={{ marginTop: 2 }}>
              Real call metrics from every LLM feature — latency, token usage, cache efficiency.
            </p>
          </div>
          <div className="segmented">
            {([
              { key: 24, label: '24h' },
              { key: 168, label: '7 days' },
              { key: undefined, label: 'All time' },
            ] as Array<{ key: ObsWindow; label: string }>).map((opt) => (
              <button
                key={opt.label}
                className={`segmented__btn ${obsWindow === opt.key ? 'segmented__btn--active' : ''}`}
                onClick={() => setObsWindow(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {obsLoading && <Spinner block label="Loading observability…" />}

        {!obsLoading && obs && (
          <>
            <div className="stat-row">
              <StatCard
                label="RAG cache hit rate"
                value={`${Math.round(obs.ragCache.hitRate * 100)}%`}
                caption={`${obs.ragCache.hits} hits · ${obs.ragCache.misses} misses`}
                tone="teal"
              />
              <StatCard
                label="Total LLM calls"
                value={String(obs.llmCalls.reduce((s, r) => s + r.calls, 0))}
                caption="Across all AI features"
                tone="blue"
              />
              <StatCard
                label="Overall success rate"
                value={
                  obs.llmCalls.length === 0
                    ? '—'
                    : `${Math.round(
                        (obs.llmCalls.reduce((s, r) => s + r.successRate * r.calls, 0) /
                          Math.max(1, obs.llmCalls.reduce((s, r) => s + r.calls, 0))) *
                          100,
                      )}%`
                }
                caption="Weighted across features"
                tone="violet"
              />
            </div>

            {obs.llmCalls.length === 0 ? (
              <p className="muted">No LLM calls recorded in this window yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Calls</th>
                      <th>Success rate</th>
                      <th>Avg latency</th>
                      <th>Input tokens</th>
                      <th>Output tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obs.llmCalls.map((row) => (
                      <tr key={row.feature}>
                        <td>{row.feature}</td>
                        <td>{row.calls}</td>
                        <td>{Math.round(row.successRate * 100)}%</td>
                        <td>{row.avgLatencyMs.toLocaleString()} ms</td>
                        <td>{row.totalInputTokens.toLocaleString()}</td>
                        <td>{row.totalOutputTokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  caption,
  icon,
  tone = 'teal',
}: {
  label: string;
  value: string;
  caption?: string;
  icon?: ReactNode;
  tone?: 'teal' | 'blue' | 'amber' | 'violet';
}) {
  return (
    <div className="stat-card">
      {icon && (
        <span className={`stat-card__icon ${tone === 'teal' ? '' : `stat-card__icon--${tone}`}`}>
          {icon}
        </span>
      )}
      <span className="stat-card__body">
        <span className="stat-card__value">{value}</span>
        <span className="stat-card__label">{label}</span>
        {caption && <span className="stat-card__caption">{caption}</span>}
      </span>
    </div>
  );
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
