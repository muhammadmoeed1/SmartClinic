import client, { API_URL, getAccessToken } from './client';
import type {
  IntakeMessageResponse,
  IntakeStartResponse,
  NoShowRiskDto,
  RecommendResponse,
  SoapFormatResponse,
  TriageResponse,
  TriageSummary,
} from '../types';

export async function recommend(description: string): Promise<RecommendResponse> {
  const res = await client.post<RecommendResponse>('/ai/recommend', { description });
  return res.data;
}

export async function intakeStart(): Promise<IntakeStartResponse> {
  const res = await client.post<IntakeStartResponse>('/ai/intake/start', {});
  return res.data;
}

export async function intakeMessage(
  sessionId: string,
  message: string,
): Promise<IntakeMessageResponse> {
  const res = await client.post<IntakeMessageResponse>('/ai/intake/message', {
    sessionId,
    message,
  });
  return res.data;
}

export type IntakeStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'done'; completed: boolean; summary?: TriageSummary }
  | { type: 'error'; fallback: boolean };

/**
 * Streams the intake assistant's reply as Server-Sent Events: 'text' deltas
 * as they're generated, then one final 'done' (or 'error') event. Uses raw
 * fetch rather than the axios client since the body is a byte stream, not JSON.
 */
export async function intakeMessageStream(
  sessionId: string,
  message: string,
  onEvent: (event: IntakeStreamEvent) => void,
): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/ai/intake/message/stream`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ sessionId, message }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Stream request failed with status ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      try {
        onEvent(JSON.parse(payload) as IntakeStreamEvent);
      } catch {
        // Ignore malformed lines rather than aborting the whole stream.
      }
    }
  }
}

export async function intakeManual(
  payload: TriageSummary & { appointmentId: string },
): Promise<void> {
  await client.post('/ai/intake/manual', payload);
}

export async function getTriage(appointmentId: string): Promise<TriageResponse> {
  const res = await client.get<TriageResponse>(`/ai/triage/${appointmentId}`);
  return res.data;
}

export async function soapFormat(rawNotes: string): Promise<SoapFormatResponse> {
  const res = await client.post<SoapFormatResponse>('/ai/soap-format', { rawNotes });
  return res.data;
}

export async function getNoShowRisk(date: string): Promise<NoShowRiskDto[]> {
  const res = await client.get<NoShowRiskDto[]>('/ai/no-show-risk', { params: { date } });
  return res.data;
}
