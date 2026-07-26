import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';
import { Appointment, User, WaitlistEntry } from '../entities';
import { AppointmentStatus, Role } from '../common/enums';
import { JwtUser } from '../common/decorators';
import { NotificationsService } from '../notifications/notifications.service';
import { clinicDateStr, clinicDayRange, clinicTime } from '../common/clinic-time';
import {
  CreateAppointmentDto, JoinWaitlistDto, ListAppointmentsQueryDto, UpdateAppointmentDto,
} from './dto';

export const SLOT_MINUTES = 30;
export const DAY_START_HOUR = 9;
export const DAY_END_HOUR = 17;

const ACTIVE_STATUSES = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.COMPLETED,
];

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment) private appointments: Repository<Appointment>,
    @InjectRepository(WaitlistEntry) private waitlist: Repository<WaitlistEntry>,
    @InjectRepository(User) private users: Repository<User>,
    private dataSource: DataSource,
    private notifications: NotificationsService,
  ) {}

  private toDto(a: Appointment) {
    return {
      id: a.id,
      patientId: a.patientId,
      doctorId: a.doctorId,
      patient: a.patient
        ? { id: a.patient.id, fullName: a.patient.fullName, phone: a.patient.phone }
        : undefined,
      doctor: a.doctor
        ? {
            id: a.doctor.id,
            fullName: a.doctor.fullName,
            specialty: a.doctor.doctorProfile?.specialty,
          }
        : undefined,
      startTime: a.startTime,
      endTime: a.endTime,
      status: a.status,
      reason: a.reason,
    };
  }

  private findWithRelations(id: string) {
    return this.appointments.findOne({
      where: { id },
      relations: { patient: true, doctor: { doctorProfile: true } },
    });
  }

  async getSlots(doctorId: string, date: string) {
    const [from, to] = clinicDayRange(date);
    const booked = await this.appointments.find({
      where: {
        doctorId,
        startTime: Between(from, to),
        status: In(ACTIVE_STATUSES),
      },
      select: ['startTime'],
    });
    const bookedTimes = new Set(booked.map((b) => b.startTime.getTime()));

    const slots: Array<{ startTime: Date; endTime: Date; available: boolean }> = [];
    for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour++) {
      for (const minute of [0, 30]) {
        const start = clinicTime(date, hour, minute);
        const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
        slots.push({
          startTime: start,
          endTime: end,
          available: !bookedTimes.has(start.getTime()) && start > new Date(),
        });
      }
    }
    return slots;
  }

  async create(user: JwtUser, dto: CreateAppointmentDto) {
    const patientId =
      user.role === Role.RECEPTIONIST || user.role === Role.ADMIN
        ? dto.patientId ?? (() => { throw new BadRequestException('patientId is required'); })()
        : user.id;

    const patient = await this.users.findOneBy({ id: patientId, role: Role.PATIENT });
    if (!patient) throw new NotFoundException('Patient not found');
    const doctor = await this.users.findOne({
      where: { id: dto.doctorId, role: Role.DOCTOR },
      relations: { doctorProfile: true },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const startTime = new Date(dto.startTime);
    if (startTime <= new Date()) throw new BadRequestException('Slot is in the past');
    const endTime = new Date(startTime.getTime() + SLOT_MINUTES * 60000);

    // Transaction + partial unique index give database-level double-booking protection.
    let saved: Appointment;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const clash = await manager.getRepository(Appointment)
          .createQueryBuilder('a')
          .setLock('pessimistic_write')
          .where('a."doctorId" = :doctorId', { doctorId: dto.doctorId })
          .andWhere('a."startTime" = :startTime', { startTime })
          .andWhere('a.status IN (:...active)', { active: ACTIVE_STATUSES })
          .getOne();
        if (clash) throw new ConflictException('Slot already booked');

        return manager.getRepository(Appointment).save(
          manager.getRepository(Appointment).create({
            patientId,
            doctorId: dto.doctorId,
            startTime,
            endTime,
            reason: dto.reason ?? null,
            createdById: user.id,
            status: AppointmentStatus.SCHEDULED,
          }),
        );
      });
    } catch (err: any) {
      if (err instanceof ConflictException) throw err;
      if (err?.code === '23505') throw new ConflictException('Slot already booked');
      throw err;
    }

    const full = (await this.findWithRelations(saved.id))!;
    await this.notifications.notify(patientId, 'appointment.confirmed', {
      appointmentId: full.id,
      startTime: full.startTime,
      doctorName: full.doctor.fullName,
    });
    this.notifications.emitAppointmentUpdate(full);
    return this.toDto(full);
  }

  async list(user: JwtUser, query: ListAppointmentsQueryDto) {
    const qb = this.appointments
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.patient', 'patient')
      .leftJoinAndSelect('a.doctor', 'doctor')
      .leftJoinAndSelect('doctor.doctorProfile', 'profile')
      .orderBy('a.startTime', 'ASC');

    if (user.role === Role.PATIENT) {
      qb.andWhere('a."patientId" = :uid', { uid: user.id });
    } else if (user.role === Role.DOCTOR) {
      qb.andWhere('a."doctorId" = :uid', { uid: user.id });
    }
    if (query.doctorId) qb.andWhere('a."doctorId" = :did', { did: query.doctorId });
    if (query.status) qb.andWhere('a.status = :status', { status: query.status });
    if (query.date) {
      const [from, to] = clinicDayRange(query.date);
      qb.andWhere('a."startTime" BETWEEN :from AND :to', { from, to });
    }
    const rows = await qb.getMany();
    return rows.map((r) => this.toDto(r));
  }

  async getOne(user: JwtUser, id: string) {
    const appt = await this.findWithRelations(id);
    if (!appt) throw new NotFoundException('Appointment not found');
    if (user.role === Role.PATIENT && appt.patientId !== user.id) throw new ForbiddenException();
    if (user.role === Role.DOCTOR && appt.doctorId !== user.id) throw new ForbiddenException();
    return this.toDto(appt);
  }

  async update(user: JwtUser, id: string, dto: UpdateAppointmentDto) {
    const appt = await this.findWithRelations(id);
    if (!appt) throw new NotFoundException('Appointment not found');

    if (user.role === Role.PATIENT && appt.patientId !== user.id) throw new ForbiddenException();
    if (user.role === Role.DOCTOR && appt.doctorId !== user.id) throw new ForbiddenException();

    if (dto.startTime) {
      if (![Role.RECEPTIONIST, Role.ADMIN, Role.PATIENT].includes(user.role)) {
        throw new ForbiddenException('Only receptionists or the patient can reschedule');
      }
      const newStart = new Date(dto.startTime);
      if (newStart <= new Date()) throw new BadRequestException('Slot is in the past');
      const clash = await this.appointments.findOne({
        where: {
          doctorId: appt.doctorId,
          startTime: newStart,
          status: In(ACTIVE_STATUSES),
        },
      });
      if (clash && clash.id !== appt.id) throw new ConflictException('Slot already booked');
      appt.startTime = newStart;
      appt.endTime = new Date(newStart.getTime() + SLOT_MINUTES * 60000);
      appt.reminded24h = false;
      appt.reminded1h = false;
    }

    if (dto.status && dto.status !== appt.status) {
      this.assertTransitionAllowed(user, appt, dto.status);
      appt.status = dto.status;
      if (dto.status === AppointmentStatus.CHECKED_IN) appt.checkedInAt = new Date();
      if (dto.status === AppointmentStatus.COMPLETED) appt.completedAt = new Date();
    }

    const saved = await this.appointments.save(appt);
    this.notifications.emitAppointmentUpdate(saved);

    if (dto.status === AppointmentStatus.CANCELLED) {
      await this.handleCancellation(saved);
    }
    if (dto.status === AppointmentStatus.CHECKED_IN) {
      await this.emitQueuePositions(saved.doctorId);
    }
    return this.toDto(saved);
  }

  private assertTransitionAllowed(
    user: JwtUser, appt: Appointment, next: AppointmentStatus,
  ) {
    const allowed: Record<string, AppointmentStatus[]> = {
      [Role.PATIENT]: [AppointmentStatus.CANCELLED],
      [Role.DOCTOR]: [AppointmentStatus.IN_PROGRESS, AppointmentStatus.COMPLETED],
      [Role.RECEPTIONIST]: [
        AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW, AppointmentStatus.SCHEDULED,
      ],
      [Role.ADMIN]: Object.values(AppointmentStatus),
    };
    if (!allowed[user.role]?.includes(next)) {
      throw new ForbiddenException(`Role ${user.role} cannot set status ${next}`);
    }
    if (
      [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED].includes(appt.status)
    ) {
      throw new BadRequestException(`Appointment already ${appt.status}`);
    }
  }

  /** Late cancellation (≤2h before start): alert the first waitlisted patient. */
  private async handleCancellation(appt: Appointment) {
    const hoursUntil = (appt.startTime.getTime() - Date.now()) / 3600000;
    if (hoursUntil > 2 || hoursUntil < 0) return;

    const date = clinicDateStr(appt.startTime);
    const next = await this.waitlist.findOne({
      where: { doctorId: appt.doctorId, date, notified: false },
      order: { createdAt: 'ASC' },
    });
    if (!next) return;

    await this.notifications.notify(next.patientId, 'waitlist.slot_available', {
      doctorId: appt.doctorId,
      doctorName: appt.doctor?.fullName,
      startTime: appt.startTime,
      message: 'A slot just opened up — book now to claim it.',
    });
    next.notified = true;
    await this.waitlist.save(next);
  }

  /** Emit live queue positions to checked-in patients of a doctor (today). */
  private async emitQueuePositions(doctorId: string) {
    const today = clinicDateStr(new Date());
    const [from, to] = clinicDayRange(today);
    const queue = await this.appointments.find({
      where: {
        doctorId,
        startTime: Between(from, to),
        status: AppointmentStatus.CHECKED_IN,
      },
      order: { checkedInAt: 'ASC' },
    });
    queue.forEach((appt, idx) => {
      this.notifications.emitQueuePosition(appt.patientId, appt.id, idx + 1);
    });
  }

  async joinWaitlist(user: JwtUser, dto: JoinWaitlistDto) {
    const patientId =
      user.role === Role.RECEPTIONIST ? dto.patientId ?? user.id : user.id;
    const entry = await this.waitlist.save(
      this.waitlist.create({
        doctorId: dto.doctorId,
        patientId,
        date: dto.date.slice(0, 10),
      }),
    );
    const position = await this.waitlist.count({
      where: { doctorId: dto.doctorId, date: entry.date, notified: false },
    });
    return { id: entry.id, doctorId: entry.doctorId, date: entry.date, position };
  }
}
