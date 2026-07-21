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
}
