import client from './client';
import type { Role, RoomDto, UserDto } from '../types';

export interface CreateDoctorPayload {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  specialty: string;
  bio?: string;
}

export async function createDoctor(payload: CreateDoctorPayload): Promise<UserDto> {
  const res = await client.post<UserDto>('/admin/doctors', payload);
  return res.data;
}

export interface CreateReceptionistPayload {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}

export async function createReceptionist(payload: CreateReceptionistPayload): Promise<UserDto> {
  const res = await client.post<UserDto>('/admin/receptionists', payload);
  return res.data;
}

export async function getRooms(): Promise<RoomDto[]> {
  const res = await client.get<RoomDto[]>('/admin/rooms');
  return res.data;
}

export async function createRoom(name: string, branch: string): Promise<RoomDto> {
  const res = await client.post<RoomDto>('/admin/rooms', { name, branch });
  return res.data;
}

export async function getUsers(role?: Role): Promise<UserDto[]> {
  const res = await client.get<UserDto[]>('/admin/users', {
    params: role ? { role } : undefined,
  });
  return res.data;
}
