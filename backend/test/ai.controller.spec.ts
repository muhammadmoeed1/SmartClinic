import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AiController } from '../src/ai/ai.controller';
import { AiService } from '../src/ai/ai.service';
import { NoShowService } from '../src/ai/no-show.service';
import { AiUnavailableException } from '../src/ai/llm.client';
import { Role } from '../src/common/enums';
import { auth, createTestApp, IDS } from './test-utils';

describe('AiController', () => {
  let app: INestApplication;
  const ai = {
    recommend: jest.fn().mockResolvedValue({
      specialty: 'Cardiology', rationale: 'x', confidence: 'high', doctors: [],
    }),
    startIntake: jest.fn().mockResolvedValue({ sessionId: IDS.record, message: 'Hi' }),
    intakeMessage: jest.fn().mockResolvedValue({ message: 'ok', completed: false }),
    intakeMessageStream: jest.fn(async function* (..._args: unknown[]) {
      yield { type: 'text', delta: 'Hel' };
      yield { type: 'text', delta: 'lo' };
      yield { type: 'done', completed: false };
    }),
    manualIntake: jest.fn().mockResolvedValue({ saved: true }),
    getTriage: jest.fn().mockResolvedValue({ summary: {}, createdAt: new Date() }),
    soapFormat: jest.fn().mockResolvedValue({
      subjective: '', objective: '', assessment: '', plan: '', icdSuggestions: [],
    }),
  };
  const noShow = {
    scoresForDate: jest.fn().mockResolvedValue([
      { appointmentId: IDS.appointment, score: 0.7, factors: ['x'] },
    ]),
  };

  beforeAll(async () => {
    app = await createTestApp([AiController], [
      { provide: AiService, useValue: ai },
      { provide: NoShowService, useValue: noShow },
    ]);
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('POST /ai/recommend is patient-only', async () => {
    await request(app.getHttpServer())
      .post('/ai/recommend').send({ description: 'chest pain' }).expect(401);
    await request(app.getHttpServer())
      .post('/ai/recommend').set(...auth(Role.DOCTOR))
      .send({ description: 'chest pain' }).expect(403);
    const res = await request(app.getHttpServer())
      .post('/ai/recommend').set(...auth(Role.PATIENT))
      .send({ description: 'chest pain' }).expect(201);
    expect(res.body.specialty).toBe('Cardiology');
  });

  it('intake endpoints degrade gracefully with 503 + fallback flag', async () => {
    ai.startIntake.mockRejectedValueOnce(new AiUnavailableException());
    const res = await request(app.getHttpServer())
      .post('/ai/intake/start').set(...auth(Role.PATIENT)).expect(503);
    expect(res.body.fallback).toBe(true);
  });

  it('POST /ai/intake/message validates payload', async () => {
    await request(app.getHttpServer())
      .post('/ai/intake/message').set(...auth(Role.PATIENT))
      .send({ sessionId: 'not-a-uuid', message: '' }).expect(400);
    await request(app.getHttpServer())
      .post('/ai/intake/message').set(...auth(Role.PATIENT))
      .send({ sessionId: IDS.record, message: 'headache' }).expect(201);
  });

  it('POST /ai/intake/message/stream is patient-only and streams SSE text + done events', async () => {
    await request(app.getHttpServer())
      .post('/ai/intake/message/stream').set(...auth(Role.DOCTOR))
      .send({ sessionId: IDS.record, message: 'hi' }).expect(403);

    const res = await request(app.getHttpServer())
      .post('/ai/intake/message/stream').set(...auth(Role.PATIENT))
      .send({ sessionId: IDS.record, message: 'hi' }).expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('data: {"type":"text","delta":"Hel"}');
    expect(res.text).toContain('data: {"type":"done","completed":false}');
  });

  it('POST /ai/intake/manual stores the static-form fallback', async () => {
    await request(app.getHttpServer())
      .post('/ai/intake/manual').set(...auth(Role.PATIENT))
      .send({
        appointmentId: IDS.appointment,
        chiefComplaint: 'Headache',
        symptomDurationDays: 3,
        severity: 6,
        relevantHistory: 'None',
        currentMedications: 'None',
        redFlags: [],
      })
      .expect(201);
    expect(ai.manualIntake).toHaveBeenCalled();
  });

  it('GET /ai/triage/:id is doctor-only', async () => {
    await request(app.getHttpServer())
      .get(`/ai/triage/${IDS.appointment}`).set(...auth(Role.PATIENT)).expect(403);
    await request(app.getHttpServer())
      .get(`/ai/triage/${IDS.appointment}`).set(...auth(Role.DOCTOR)).expect(200);
  });

  it('POST /ai/soap-format is doctor-only', async () => {
    await request(app.getHttpServer())
      .post('/ai/soap-format').set(...auth(Role.PATIENT))
      .send({ rawNotes: 'pt c/o back pain' }).expect(403);
    await request(app.getHttpServer())
      .post('/ai/soap-format').set(...auth(Role.DOCTOR))
      .send({ rawNotes: 'pt c/o back pain' }).expect(201);
  });

  it('GET /ai/no-show-risk is receptionist/admin-only and validates date', async () => {
    await request(app.getHttpServer())
      .get('/ai/no-show-risk?date=2026-07-15').set(...auth(Role.PATIENT)).expect(403);
    await request(app.getHttpServer())
      .get('/ai/no-show-risk?date=bad').set(...auth(Role.RECEPTIONIST)).expect(400);
    const res = await request(app.getHttpServer())
      .get('/ai/no-show-risk?date=2026-07-15').set(...auth(Role.RECEPTIONIST)).expect(200);
    expect(res.body[0].score).toBeGreaterThan(0.65);
  });
});
