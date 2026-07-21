import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const start = process.hrtime.bigint();
    // req.route is only populated once routing resolves; falls back to the
    // raw URL for 404s so unmatched routes still show up in metrics.
    const route: string = req.route?.path ?? req.url ?? 'unknown';
    const method: string = req.method ?? 'UNKNOWN';

    const record = () => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      const labels = { method, route, status_code: String(res.statusCode) };
      this.metrics.httpRequestDuration.observe(labels, seconds);
      this.metrics.httpRequestsTotal.inc(labels);
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
