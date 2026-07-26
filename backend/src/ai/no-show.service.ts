import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Appointment, DoctorProfile } from '../entities';
import { AppointmentStatus } from '../common/enums';
import { clinicDayOfWeek, clinicDayRange, clinicHour } from '../common/clinic-time';

export interface RiskResult {
  appointmentId: string;
  score: number;
  factors: string[];
}

/**
 * AI Feature 4 (bonus): rule-based no-show risk scoring.
 * Features: patient no-show history, lead time, time of day, day of week, specialty.
 * Score > 0.65 is flagged in the receptionist calendar.
 */
@Injectable()
export class NoShowService {
  constructor(
    @InjectRepository(Appointment) private appointments: Repository<Appointment>,
    @InjectRepository(DoctorProfile) private profiles: Repository<DoctorProfile>,
  ) {}

  async scoresForDate(date: string): Promise<RiskResult[]> {
    const [from, to] = clinicDayRange(date);
    const upcoming = await this.appointments.find({
      where: {
        startTime: Between(from, to),
        status: In([AppointmentStatus.SCHEDULED]),
      },
    });
    if (upcoming.length === 0) return [];

    const patientIds = [...new Set(upcoming.map((a) => a.patientId))];
    const history = await this.appointments
      .createQueryBuilder('a')
      .select('a."patientId"', 'patientId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        `COUNT(*) FILTER (WHERE a.status = '${AppointmentStatus.NO_SHOW}')`,
        'noShows',
      )
      .where('a."patientId" IN (:...ids)', { ids: patientIds })
      .andWhere('a."startTime" < now()')
      .groupBy('a."patientId"')
      .getRawMany();
    const historyMap = new Map(
      history.map((h) => [
        h.patientId,
        { total: parseInt(h.total, 10), noShows: parseInt(h.noShows, 10) },
      ]),
    );

    const doctorIds = [...new Set(upcoming.map((a) => a.doctorId))];
    const specialties = await this.profiles.find({ where: { userId: In(doctorIds) } });
    const specialtyMap = new Map(specialties.map((p) => [p.userId, p.specialty]));

    return upcoming.map((appt) =>
      this.score(appt, historyMap.get(appt.patientId), specialtyMap.get(appt.doctorId)),
    );
  }

  score(
    appt: Appointment,
    history: { total: number; noShows: number } | undefined,
    specialty: string | undefined,
  ): RiskResult {
    let score = 0.1;
    const factors: string[] = [];

    // Patient no-show history — the strongest signal.
    if (history && history.total >= 2) {
      const rate = history.noShows / history.total;
      if (rate > 0) {
        score += Math.min(rate, 0.8) * 0.55;
        factors.push(
          `Past no-show rate ${(rate * 100).toFixed(0)}% (${history.noShows}/${history.total} visits)`,
        );
      }
    } else {
      score += 0.08;
      factors.push('New patient — little booking history');
    }

    // Lead time: bookings made long in advance are forgotten more often.
    const leadDays = (appt.startTime.getTime() - appt.createdAt.getTime()) / 86400000;
    if (leadDays > 7) {
      score += 0.15;
      factors.push(`Booked ${Math.round(leadDays)} days in advance`);
    } else if (leadDays > 3) {
      score += 0.07;
      factors.push(`Booked ${Math.round(leadDays)} days in advance`);
    }

    // Time of day: first slot and last slots see more no-shows.
    const hour = clinicHour(appt.startTime);
    if (hour === 9) {
      score += 0.07;
      factors.push('Early-morning slot');
    } else if (hour >= 16) {
      score += 0.07;
      factors.push('Late-afternoon slot');
    }

    // Day of week: Mondays and Fridays skew higher.
    const dow = clinicDayOfWeek(appt.startTime);
    if (dow === 1 || dow === 5) {
      score += 0.05;
      factors.push(dow === 1 ? 'Monday appointment' : 'Friday appointment');
    }

    // Specialty: routine/elective visits are skipped more than acute ones.
    if (specialty === 'Dermatology') {
      score += 0.05;
      factors.push('Elective specialty (Dermatology)');
    }

    return {
      appointmentId: appt.id,
      score: Math.min(0.95, Math.round(score * 100) / 100),
      factors,
    };
  }
}
