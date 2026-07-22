import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Appointment, DoctorProfile, TriageSummary, VisitRecord, TriageData } from '../entities';
import { AppointmentStatus, SPECIALTIES } from '../common/enums';
import { JwtUser } from '../common/decorators';
import { AgentMessage, AiUnavailableException, LlmClient, ToolCall } from './llm.client';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { SessionStore } from '../common/session-store';
import { redactPii } from '../common/pii-redact';
import {
  INTAKE_OPENING_MESSAGE, INTAKE_SYSTEM_PROMPT, PROMPT_VERSIONS, RECOMMEND_SYSTEM_PROMPT,
  RECOMMEND_TOOL, RECORD_INTAKE_SUMMARY_TOOL, SEARCH_KNOWLEDGE_BASE_TOOL, SOAP_SYSTEM_PROMPT,
  SOAP_TOOL, recommendUserPrompt, soapUserPrompt,
} from './prompts';

interface IntakeSession {
  patientId: string;
  appointmentId: string;
  history: AgentMessage[];
}

const SESSION_TTL_MS = 60 * 60 * 1000;
/** Caps the search_knowledge_base ↔ model round-trips per turn so a
 *  confused model can't loop forever instead of replying to the patient. */
const MAX_TOOL_HOPS = 3;

@Injectable()
export class AiService {
  constructor(
    private llm: LlmClient,
    private knowledge: KnowledgeService,
    private sessions: SessionStore<IntakeSession>,
    @InjectRepository(Appointment) private appointments: Repository<Appointment>,
    @InjectRepository(TriageSummary) private triage: Repository<TriageSummary>,
    @InjectRepository(VisitRecord) private records: Repository<VisitRecord>,
    @InjectRepository(DoctorProfile) private profiles: Repository<DoctorProfile>,
  ) {}

  // ---------- AI Feature 2: Smart Appointment Recommender (RAG) ----------

  async recommend(user: JwtUser, description: string) {
    const { redacted: safeDescription } = redactPii(description);
    const [historyHits, knowledgeHits] = await Promise.all([
      this.knowledge.searchPatientHistory(user.id, safeDescription, 3),
      this.knowledge.searchKnowledge(safeDescription, 3, 'specialty-routing'),
    ]);

    const step = await this.llm.runAgentStep(
      RECOMMEND_SYSTEM_PROMPT,
      [{ role: 'user', content: recommendUserPrompt(safeDescription, historyHits, knowledgeHits) }],
      [RECOMMEND_TOOL],
      {
        maxTokens: 512,
        forceTool: RECOMMEND_TOOL.name,
        feature: 'recommend',
        promptVersion: PROMPT_VERSIONS.recommend,
      },
    );

    const input = step.toolCall?.input ?? {};
    const specialty = (SPECIALTIES as readonly string[]).includes(input.specialty)
      ? input.specialty
      : 'General Practice';

    const doctorProfiles = await this.profiles.find({
      where: { specialty },
      relations: { user: true },
      take: 2,
    });

    return {
      specialty,
      rationale: input.rationale ?? 'Based on your description, this specialty fits best.',
      confidence: ['low', 'medium', 'high'].includes(input.confidence) ? input.confidence : 'medium',
      doctors: doctorProfiles.map((p) => ({
        id: p.userId,
        fullName: p.user.fullName,
        specialty: p.specialty,
      })),
    };
  }

  // ---------- AI Feature 1: Patient Intake Chatbot (agentic) ----------

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
    await this.sessions.set(
      sessionId,
      {
        patientId: user.id,
        appointmentId: appt.id,
        history: [{ role: 'assistant', content: INTAKE_OPENING_MESSAGE }],
      },
      SESSION_TTL_MS,
    );
    return { sessionId, message: INTAKE_OPENING_MESSAGE };
  }

  async intakeMessage(user: JwtUser, sessionId: string, message: string) {
    const session = await this.getIntakeSession(sessionId, user.id);
    session.history.push({ role: 'user', content: redactPii(message).redacted });

    const result = await this.runIntakeAgentLoop(session);
    if (result.summary) {
      await this.saveTriage(session.appointmentId, session.patientId, result.summary, 'ai');
      await this.sessions.delete(sessionId);
      return { message: result.text, completed: true, summary: result.summary };
    }
    await this.sessions.set(sessionId, session, SESSION_TTL_MS);
    return { message: result.text, completed: false };
  }

  /**
   * Same agentic loop as intakeMessage(), but yields the assistant's reply as
   * text deltas in real time (SSE) instead of waiting for the full response —
   * only the final "done" event carries completion/summary status. A tool
   * call (search_knowledge_base or record_intake_summary) always resolves
   * only once its provider stream ends, so nothing tool-related is streamed
   * to the client — just the conversational text.
   */
  async *intakeMessageStream(
    user: JwtUser,
    sessionId: string,
    message: string,
    signal?: AbortSignal,
  ): AsyncGenerator<
    { type: 'text'; delta: string } | { type: 'done'; completed: boolean; summary?: TriageData },
    void,
    unknown
  > {
    const session = await this.getIntakeSession(sessionId, user.id);
    session.history.push({ role: 'user', content: redactPii(message).redacted });
    const tools = [SEARCH_KNOWLEDGE_BASE_TOOL, RECORD_INTAKE_SUMMARY_TOOL];

    for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
      let text = '';
      let toolCall: ToolCall | null = null;
      for await (const event of this.llm.streamAgentStep(INTAKE_SYSTEM_PROMPT, session.history, tools, {
        maxTokens: 1024,
        feature: 'intake_stream',
        promptVersion: PROMPT_VERSIONS.intake,
        signal,
      })) {
        if (event.type === 'text') {
          yield { type: 'text', delta: event.delta };
        } else {
          text = event.result.text;
          toolCall = event.result.toolCall;
        }
      }

      if (!toolCall) {
        session.history.push({ role: 'assistant', content: text });
        await this.sessions.set(sessionId, session, SESSION_TTL_MS);
        yield { type: 'done', completed: false };
        return;
      }

      if (toolCall.name === 'record_intake_summary') {
        session.history.push({ role: 'assistant', content: text, toolCall });
        const summary = toolCall.input as TriageData;
        await this.saveTriage(session.appointmentId, session.patientId, summary, 'ai');
        await this.sessions.delete(sessionId);
        yield { type: 'done', completed: true, summary };
        return;
      }

      session.history.push({ role: 'assistant', content: text, toolCall });
      session.history.push({
        role: 'tool',
        toolCallId: toolCall.id,
        name: toolCall.name,
        content: await this.executeSearchKnowledgeBase(toolCall),
      });
    }
    yield { type: 'done', completed: false };
  }

  private async getIntakeSession(sessionId: string, patientId: string): Promise<IntakeSession> {
    const session = await this.sessions.get(sessionId);
    if (!session) throw new NotFoundException('Intake session not found or expired');
    if (session.patientId !== patientId) throw new ForbiddenException();
    return session;
  }

  /**
   * Agentic loop: the model can call search_knowledge_base to check triage
   * guidance before replying, and must call record_intake_summary once all
   * five fields are collected — replacing the old <SUMMARY> marker regex.
   */
  private async runIntakeAgentLoop(
    session: IntakeSession,
  ): Promise<{ text: string; summary: TriageData | null }> {
    const tools = [SEARCH_KNOWLEDGE_BASE_TOOL, RECORD_INTAKE_SUMMARY_TOOL];

    for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
      const step = await this.llm.runAgentStep(INTAKE_SYSTEM_PROMPT, session.history, tools, {
        maxTokens: 1024,
        feature: 'intake',
        promptVersion: PROMPT_VERSIONS.intake,
      });

      if (!step.toolCall) {
        session.history.push({ role: 'assistant', content: step.text });
        return { text: step.text, summary: null };
      }

      if (step.toolCall.name === 'record_intake_summary') {
        session.history.push({ role: 'assistant', content: step.text, toolCall: step.toolCall });
        return {
          text: step.text || 'Thank you — your intake is complete.',
          summary: step.toolCall.input as TriageData,
        };
      }

      // search_knowledge_base: execute server-side and feed the result back for another hop.
      session.history.push({ role: 'assistant', content: step.text, toolCall: step.toolCall });
      session.history.push({
        role: 'tool',
        toolCallId: step.toolCall.id,
        name: step.toolCall.name,
        content: await this.executeSearchKnowledgeBase(step.toolCall),
      });
    }
    return { text: 'Sorry, could you rephrase that?', summary: null };
  }

  private async executeSearchKnowledgeBase(toolCall: ToolCall): Promise<string> {
    const query = String(toolCall.input?.query ?? '');
    const hits = await this.knowledge.searchKnowledge(query, 2, 'triage');
    return hits.length
      ? hits.map((h) => `${h.title}: ${h.content}`).join('\n')
      : 'No matching guidance found.';
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

  // ---------- AI Feature 3: Clinical Note Assistant (SOAP formatter, RAG) ----------

  async soapFormat(rawNotes: string) {
    const { redacted: safeNotes } = redactPii(rawNotes);
    const knowledgeHits = await this.knowledge.searchKnowledge(safeNotes, 2, 'documentation');
    const step = await this.llm.runAgentStep(
      SOAP_SYSTEM_PROMPT,
      [{ role: 'user', content: soapUserPrompt(safeNotes, knowledgeHits) }],
      [SOAP_TOOL],
      {
        maxTokens: 1024,
        forceTool: SOAP_TOOL.name,
        feature: 'soap_format',
        promptVersion: PROMPT_VERSIONS.soap,
      },
    );
    const input = step.toolCall?.input;
    if (!input) {
      throw new BadRequestException('AI returned an unparseable response — please try again');
    }
    return {
      subjective: input.subjective ?? '',
      objective: input.objective ?? '',
      assessment: input.assessment ?? '',
      plan: input.plan ?? '',
      icdSuggestions: (input.icdSuggestions ?? []).slice(0, 3),
    };
  }
}
