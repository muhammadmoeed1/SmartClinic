import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MetricsController } from '../src/metrics/metrics.controller';
import { MetricsService } from '../src/metrics/metrics.service';
import { createTestApp } from './test-utils';

describe('MetricsController', () => {
  let app: INestApplication;
  const metrics = {
    metrics: jest.fn().mockResolvedValue('http_requests_total 1\n'),
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
  };

  beforeAll(async () => {
    app = await createTestApp([MetricsController], [
      { provide: MetricsService, useValue: metrics },
    ]);
  });
  afterAll(() => app.close());

  it('GET /metrics is public and returns Prometheus-format text', async () => {
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('http_requests_total');
  });
});
