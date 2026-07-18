import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Appointment, DoctorProfile, TriageSummary, VisitRecord, TriageData } from '../entities';
import { AppointmentStatus, SPECIALTIES } from '../common/enums';
import { JwtUser } from '../common/decorators';
import { AiUnavailableException, ChatMessage, LlmClient, extractJson } from './llm.client';
import {
  INTAKE_OPENING_MESSAGE, INTAKE_SYSTEM_PROMPT,
  RECOMMEND_SYSTEM_PROMPT, SOAP_SYSTEM_PROMPT, recommendUserPrompt,
} from './prompts';

interface IntakeSession {
  patientId: string;
  appointmentId: string;
  messages: ChatMessage[];
  createdAt: number;
}

const SESSION_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AiService {
  /**
   * Intake conversation context is held in memory keyed by sessionId (the full
   * message history is replayed to the LLM each turn). Sessions expire after 1h.
   */
  private sessions = new Map<string, IntakeSession>();

  constructor(
    private llm: LlmClient,
    @InjectRepository(Appointment) private appointments: Repository<Appointment>,
    @InjectRepository(TriageSummary) private triage: Repository<TriageSummary>,
    @InjectRepository(VisitRecord) private records: Repository<VisitRecord>,
    @InjectRepository(DoctorProfile) private profiles: Repository<DoctorProfile>,
  ) {}

  // ---------- AI Feature 2: Smart Appointment Recommender ----------

  async recommend(user: JwtUser, description: string) {
    const pastRecords = await this.records.find({
      where: { patientId: user.id },
      order: { createdAt: 'DESC' },
      take: 3,
    });
    const history = pastRecords
      .filter((r) => r.assessment)
      .map((r) => r.assessment.slice(0, 200));

    const reply = await this.llm.chat(
      RECOMMEND_SYSTEM_PROMPT,
      [{ role: 'user', content: recommendUserPrompt(description, history) }],
      512,
    );
    const parsed = extractJson<{
      specialty: string; rationale: string; confidence: string;
    }>(reply);

    const specialty = SPECIALTIES.includes(parsed?.specialty as any)
      ? parsed!.specialty
      : 'General Practice';

    const doctorProfiles = await this.profiles.find({
      where: { specialty },
      relations: { user: true },
      take: 2,
    });

    return {
      specialty,
      rationale: parsed?.rationale ?? 'Based on your description, this specialty fits best.',
      confidence: ['low', 'medium', 'high'].includes(parsed?.confidence ?? '')
        ? parsed!.confidence
        : 'medium',
      doctors: doctorProfiles.map((p) => ({
        id: p.userId,
        fullName: p.user.fullName,
        specialty: p.specialty,
      })),
    };
  }

  // ---------- AI Feature 1: Patient Intake Chatbot ----------

  private async upcomingAppointmentWithin24h(patientId: string): Promise<Appointment> {
    const now = new Date();
    const appt = await this.appointments.findOne({
      where: {
        patientId,
        status: AppointmentStatus.SCHEDULED,
        startTime: Between(now, new Date(now.getTime() + 24 * 3600000)),
      },
      order: { startTime: 'ASC' },
    });
    if (!appt) {
      throw new BadRequestException('No upcoming appointment within 24 hours');
    }
    return appt;
  }

  async startIntake(user: JwtUser) {
    const appt = await this.upcomingAppointmentWithin24h(user.id);
    if (!this.llm.available) {
      // Graceful degradation: the frontend switches to the static intake form.
      throw new AiUnavailableException();
    }
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      patientId: user.id,
      appointmentId: appt.id,
      messages: [{ role: 'assistant', content: INTAKE_OPENING_MESSAGE }],
      createdAt: Date.now(),
    });
    this.pruneSessions();
    return { sessionId, message: INTAKE_OPENING_MESSAGE };
  }

  async intakeMessage(user: JwtUser, sessionId: string, message: string) {
    const session = this.sessions.get(sessionId);
    if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
      throw new NotFoundException('Intake session not found or expired');
    }
    if (session.patientId !== user.id) throw new ForbiddenException();

    session.messages.push({ role: 'user', content: message });
    const reply = await this.llm.chat(INTAKE_SYSTEM_PROMPT, session.messages, 1024);
    session.messages.push({ role: 'assistant', content: reply });

    const summaryMatch = reply.match(/<SUMMARY>([\s\S]*?)<\/SUMMARY>/);
    if (summaryMatch) {
      const summary = extractJson<TriageData>(summaryMatch[1]);
      if (summary) {
        await this.saveTriage(session.appointmentId, session.patientId, summary, 'ai');
        this.sessions.delete(sessionId);
        return {
          message: reply.replace(/<SUMMARY>[\s\S]*?<\/SUMMARY>/, '').trim(),
          completed: true,
          summary,
        };
      }
    }
    return { message: reply, completed: false };
  }

  /** Static-form fallback when the AI service is unavailable. */
  async manualIntake(user: JwtUser, appointmentId: string, data: TriageData) {
    const appt = await this.appointments.findOneBy({ id: appointmentId });
    if (!appt) throw new NotFoundException('Appointment not found');
    if (appt.patientId !== user.id) throw new ForbiddenException();
    await this.saveTriage(appointmentId, user.id, data, 'manual');
    return { saved: true };
  }

  private async saveTriage(
    appointmentId: string, patientId: string, summary: TriageData, source: 'ai' | 'manual',
  ) {
    const existing = await this.triage.findOneBy({ appointmentId });
    if (existing) {
      existing.summary = summary;
      existing.source = source;
      await this.triage.save(existing);
    } else {
      await this.triage.save(
        this.triage.create({ appointmentId, patientId, summary, source }),
      );
    }
  }

  async getTriage(user: JwtUser, appointmentId: string) {
    const appt = await this.appointments.findOneBy({ id: appointmentId });
    if (!appt) throw new NotFoundException('Appointment not found');
    if (appt.doctorId !== user.id) {
      throw new ForbiddenException('Only the assigned doctor can view the triage summary');
    }
    const row = await this.triage.findOneBy({ appointmentId });
    if (!row) throw new NotFoundException('No triage summary for this appointment');
    return { summary: row.summary, source: row.source, createdAt: row.createdAt };
  }

  // ---------- AI Feature 3: Clinical Note Assistant (SOAP formatter) ----------

  async soapFormat(rawNotes: string) {
    const reply = await this.llm.chat(
      SOAP_SYSTEM_PROMPT,
      [{ role: 'user', content: `Doctor's raw notes:\n"""\n${rawNotes}\n"""` }],
      1024,
    );
    const parsed = extractJson<{
      subjective: string; objective: string; assessment: string; plan: string;
      icdSuggestions: Array<{ code: string; description: string }>;
    }>(reply);
    if (!parsed) {
      throw new BadRequestException('AI returned an unparseable response — please try again');
    }
    return {
      subjective: parsed.subjective ?? '',
      objective: parsed.objective ?? '',
      assessment: parsed.assessment ?? '',
      plan: parsed.plan ?? '',
      icdSuggestions: (parsed.icdSuggestions ?? []).slice(0, 3),
    };
  }

  private pruneSessions() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.createdAt > SESSION_TTL_MS) this.sessions.delete(id);
    }
  }
}
