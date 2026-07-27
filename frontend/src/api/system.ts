import client from './client';
import type { HealthResponse, SystemHealthSummary } from '../types';

export async function getHealth(): Promise<HealthResponse> {
  const res = await client.get<HealthResponse>('/health');
  return res.data;
}

export async function getSystemHealth(): Promise<SystemHealthSummary> {
  const res = await client.get<SystemHealthSummary>('/admin/system-health');
  return res.data;
}
