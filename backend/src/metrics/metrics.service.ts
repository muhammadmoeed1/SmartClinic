import { Injectable, OnModuleInit } from '@nestjs/common';
import { Registry, Histogram, Counter, collectDefaultMetrics } from 'prom-client';

/** Prometheus-format metrics: Node/process defaults (CPU, memory, event
 * loop lag) plus a custom HTTP request duration histogram and counter,
 * recorded by MetricsInterceptor on every request. */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();
  httpRequestDuration!: Histogram<string>;
  httpRequestsTotal!: Counter<string>;

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  /** Small JSON summary of key metrics, for the admin system-health panel
   * (the raw /metrics endpoint is Prometheus text format, not meant for
   * a UI to parse). */
  async summary() {
    return {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      totalRequests: await this.sumMetric('http_requests_total'),
      memoryMb: Math.round((await this.gaugeValue('process_resident_memory_bytes')) / 1024 / 1024),
      cpuSeconds: Math.round(
        (await this.gaugeValue('process_cpu_user_seconds_total')) +
          (await this.gaugeValue('process_cpu_system_seconds_total')),
      ),
      eventLoopLagMs: Math.round((await this.gaugeValue('nodejs_eventloop_lag_seconds')) * 1000),
    };
  }

  private async sumMetric(name: string): Promise<number> {
    const metric = this.registry.getSingleMetric(name);
    if (!metric) return 0;
    const data = await metric.get();
    return data.values.reduce((sum, v) => sum + v.value, 0);
  }

  private async gaugeValue(name: string): Promise<number> {
    const metric = this.registry.getSingleMetric(name);
    if (!metric) return 0;
    const data = await metric.get();
    return data.values[0]?.value ?? 0;
  }
}
