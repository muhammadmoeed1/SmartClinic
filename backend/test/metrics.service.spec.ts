import { MetricsService } from '../src/metrics/metrics.service';

describe('MetricsService', () => {
  it('exposes default process metrics plus the custom HTTP histogram/counter after init', async () => {
    const service = new MetricsService();
    service.onModuleInit();

    service.httpRequestDuration.observe({ method: 'GET', route: '/health', status_code: '200' }, 0.05);
    service.httpRequestsTotal.inc({ method: 'GET', route: '/health', status_code: '200' });

    const output = await service.metrics();
    expect(output).toContain('http_request_duration_seconds');
    expect(output).toContain('http_requests_total');
    expect(output).toContain('process_cpu_user_seconds_total');
    expect(service.contentType).toContain('text/plain');
  });
});
