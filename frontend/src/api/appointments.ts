import client from './client';
import type {
  AppointmentDto, AppointmentStatus, RatingDto, SlotDto, WaitlistEntryDto, WaitlistListEntryDto,
} from '../types';

export interface AppointmentQuery {
  date?: string; // YYYY-MM-DD
  from?: string; // YYYY-MM-DD, open-ended range: all appointments on/after this date
  status?: AppointmentStatus;
  doctorId?: string;
}

export async function getAppointments(query: AppointmentQuery = {}): Promise<AppointmentDto[]> {
  const res = await client.get<AppointmentDto[]>('/appointments', { params: query });
  return res.data;
}

export async function getAppointment(id: string): Promise<AppointmentDto> {
  const res = await client.get<AppointmentDto>(`/appointments/${id}`);
  return res.data;
}

export async function getSlots(doctorId: string, date: string): Promise<SlotDto[]> {
  const res = await client.get<SlotDto[]>('/appointments/slots', {
    params: { doctorId, date },
  });
  return res.data;
}

export interface CreateAppointmentPayload {
  doctorId: string;
  startTime: string; // ISO
  reason?: string;
  patientId?: string; // receptionist booking on behalf of a patient
}

export async function createAppointment(
  payload: CreateAppointmentPayload,
): Promise<AppointmentDto> {
  const res = await client.post<AppointmentDto>('/appointments', payload);
  return res.data;
}

export interface UpdateAppointmentPayload {
  startTime?: string;
  status?: AppointmentStatus;
}

export async function updateAppointment(
  id: string,
  payload: UpdateAppointmentPayload,
): Promise<AppointmentDto> {
  const res = await client.patch<AppointmentDto>(`/appointments/${id}`, payload);
  return res.data;
}

export async function joinWaitlist(
  doctorId: string,
  date: string,
  patientId?: string,
): Promise<WaitlistEntryDto> {
  const res = await client.post<WaitlistEntryDto>('/appointments/waitlist', {
    doctorId,
    date,
    ...(patientId ? { patientId } : {}),
  });
  return res.data;
}

export async function getWaitlist(doctorId?: string, date?: string): Promise<WaitlistListEntryDto[]> {
  const res = await client.get<WaitlistListEntryDto[]>('/appointments/waitlist', {
    params: { doctorId, date },
  });
  return res.data;
}

export async function notifyWaitlistEntry(id: string): Promise<void> {
  await client.post(`/appointments/waitlist/${id}/notify`);
}

export async function submitRating(
  appointmentId: string,
  score: number,
  comment?: string,
): Promise<RatingDto> {
  const res = await client.post<RatingDto>(`/appointments/${appointmentId}/rating`, {
    score,
    ...(comment ? { comment } : {}),
  });
  return res.data;
}
