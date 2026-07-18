import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { createTestApp } from './test-utils';

describe('HealthController', () => {
  let app: INestApplication;
  const dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

  beforeAll(async () => {
    app = await createTestApp([HealthController], [
      { provide: getDataSourceToken(), useValue: dataSource },
    ]);
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('GET /health is public and reports ok when the DB responds', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
    expect(typeof res.body.uptime).toBe('number');
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('GET /health reports degraded when the DB query fails', async () => {
    dataSource.query.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
  });
});
