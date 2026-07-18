/**
 * Seed script: demo users, doctors, rooms, 30 days of historical appointments
 * (for analytics), upcoming appointments, and sample pre-auth requests.
 * Run with: npm run seed   (idempotent — skips if admin already exists)
 */
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from './data-source';
import {
  User, DoctorProfile, Room, Appointment, PreAuth, VisitRecord,
} from '../entities';
import { AppointmentStatus, PreAuthStatus, Role, INSURANCE_PROVIDERS } from '../common/enums';

const PASSWORD = 'Password1!';

const DOCTORS: Array<{ name: string; email: string; specialty: string }> = [
  { name: 'Dr. Ayesha Khan', email: 'dr.khan@smartclinic.test', specialty: 'General Practice' },
  { name: 'Dr. Bilal Ahmed', email: 'dr.ahmed@smartclinic.test', specialty: 'General Practice' },
  { name: 'Dr. Sana Malik', email: 'dr.malik@smartclinic.test', specialty: 'General Practice' },
  { name: 'Dr. Omar Farooq', email: 'dr.farooq@smartclinic.test', specialty: 'Cardiology' },
  { name: 'Dr. Hina Raza', email: 'dr.raza@smartclinic.test', specialty: 'Cardiology' },
  { name: 'Dr. Adeel Siddiqui', email: 'dr.siddiqui@smartclinic.test', specialty: 'Cardiology' },
  { name: 'Dr. Mariam Yousaf', email: 'dr.yousaf@smartclinic.test', specialty: 'Dermatology' },
  { name: 'Dr. Kamran Ali', email: 'dr.ali@smartclinic.test', specialty: 'Dermatology' },
  { name: 'Dr. Nadia Hussain', email: 'dr.hussain@smartclinic.test', specialty: 'Dermatology' },
  { name: 'Dr. Faisal Mehmood', email: 'dr.mehmood@smartclinic.test', specialty: 'Orthopaedics' },
  { name: 'Dr. Zara Iqbal', email: 'dr.iqbal@smartclinic.test', specialty: 'Orthopaedics' },
  { name: 'Dr. Usman Tariq', email: 'dr.tariq@smartclinic.test', specialty: 'Orthopaedics' },
];

const PATIENTS = [
  { name: 'Ali Hassan', email: 'patient@smartclinic.test' },
  { name: 'Fatima Noor', email: 'fatima@smartclinic.test' },
  { name: 'Ahmed Raza', email: 'ahmed@smartclinic.test' },
  { name: 'Sara Javed', email: 'sara@smartclinic.test' },
  { name: 'Hamza Sheikh', email: 'hamza@smartclinic.test' },
  { name: 'Ayesha Tariq', email: 'ayesha@smartclinic.test' },
  { name: 'Imran Qureshi', email: 'imran@smartclinic.test' },
  { name: 'Zainab Akram', email: 'zainab@smartclinic.test' },
];

function rand(n: number): number {
  return Math.floor(Math.random() * n);
}

function atHour(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  const ds = await AppDataSource.initialize();
  const users = ds.getRepository(User);

  if (await users.findOneBy({ email: 'admin@smartclinic.test' })) {
    console.log('Seed data already present — nothing to do.');
    await ds.destroy();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);

  await users.save(users.create({
    email: 'admin@smartclinic.test', passwordHash: hash,
    fullName: 'Clinic Admin', phone: '+92-300-0000001', role: Role.ADMIN,
  }));
  const receptionist = await users.save(users.create({
    email: 'reception@smartclinic.test', passwordHash: hash,
    fullName: 'Rabia Receptionist', phone: '+92-300-0000002', role: Role.RECEPTIONIST,
  }));

  const rooms = ds.getRepository(Room);
  const branches = ['Downtown', 'North', 'Gulberg', 'Harbor'];
  const savedRooms: Room[] = [];
  for (const branch of branches) {
    for (let i = 1; i <= 3; i++) {
      savedRooms.push(await rooms.save(rooms.create({ name: `Room ${i}`, branch })));
    }
  }

  const profiles = ds.getRepository(DoctorProfile);
  const doctorUsers: Array<{ user: User; specialty: string }> = [];
  for (let i = 0; i < DOCTORS.length; i++) {
    const d = DOCTORS[i];
    const u = await users.save(users.create({
      email: d.email, passwordHash: hash, fullName: d.name,
      phone: `+92-301-00000${10 + i}`, role: Role.DOCTOR,
    }));
    await profiles.save(profiles.create({
      userId: u.id, specialty: d.specialty,
      bio: `${d.specialty} specialist at Al-Noor Medical Group.`,
      roomId: savedRooms[i % savedRooms.length].id,
    }));
    doctorUsers.push({ user: u, specialty: d.specialty });
  }

  const patientUsers: User[] = [];
  for (let i = 0; i < PATIENTS.length; i++) {
    const p = PATIENTS[i];
    patientUsers.push(await users.save(users.create({
      email: p.email, passwordHash: hash, fullName: p.name,
      phone: `+92-302-00000${20 + i}`, role: Role.PATIENT,
    })));
  }

  // --- Historical appointments: past 30 days (weekdays), for analytics ---
  const appts = ds.getRepository(Appointment);
  const records = ds.getRepository(VisitRecord);
  const preauths = ds.getRepository(PreAuth);
  const now = new Date();

  for (let daysAgo = 30; daysAgo >= 1; daysAgo--) {
    const day = new Date(now);
    day.setDate(day.getDate() - daysAgo);
    if (day.getDay() === 0 || day.getDay() === 6) continue;

    for (const doc of doctorUsers) {
      const bookings = 4 + rand(6); // 4-9 bookings out of 16 slots
      const usedHours = new Set<number>();
      for (let b = 0; b < bookings; b++) {
        const hour = 9 + rand(8);
        const minute = rand(2) * 30;
        const key = hour * 100 + minute;
        if (usedHours.has(key)) continue;
        usedHours.add(key);

        const patient = patientUsers[rand(patientUsers.length)];
        const start = atHour(day, hour, minute);
        const end = new Date(start.getTime() + 30 * 60000);
        const roll = Math.random();
        const status =
          roll < 0.2 ? AppointmentStatus.NO_SHOW :
          roll < 0.27 ? AppointmentStatus.CANCELLED :
          AppointmentStatus.COMPLETED;

        const appt = appts.create({
          patientId: patient.id, doctorId: doc.user.id,
          startTime: start, endTime: end, status,
          reason: 'Follow-up consultation', createdById: receptionist.id,
          reminded24h: true, reminded1h: true,
        });
        if (status === AppointmentStatus.COMPLETED) {
          appt.checkedInAt = new Date(start.getTime() - 10 * 60000);
          const durations: Record<string, number> = {
            'General Practice': 15, Cardiology: 30, Dermatology: 20, Orthopaedics: 25,
          };
          const base = durations[doc.specialty] || 20;
          appt.completedAt = new Date(start.getTime() + (base + rand(10)) * 60000);
        }
        const saved = await appts.save(appt);

        if (status === AppointmentStatus.COMPLETED) {
          await records.save(records.create({
            appointmentId: saved.id, patientId: patient.id, doctorId: doc.user.id,
            subjective: 'Patient reported ongoing symptoms.',
            objective: 'Vitals within normal limits.',
            assessment: 'Stable, continue current management.',
            plan: 'Review in 4 weeks.',
            icdCodes: [], finalized: doc.specialty === 'General Practice',
          }));

          // Specialist visits get a pre-auth record
          if (doc.specialty !== 'General Practice' && Math.random() < 0.7) {
            const created = new Date(start.getTime() - (48 + rand(48)) * 3600000);
            const submitted = new Date(created.getTime() + rand(12) * 3600000);
            const decided = new Date(submitted.getTime() + (4 + rand(70)) * 3600000);
            const approved = Math.random() < 0.78;
            await preauths.save(preauths.create({
              appointmentId: saved.id,
              provider: INSURANCE_PROVIDERS[rand(INSURANCE_PROVIDERS.length)],
              status: approved ? PreAuthStatus.APPROVED : PreAuthStatus.REJECTED,
              diagnosisCode: ['I10', 'L20.9', 'M54.5', 'I25.1'][rand(4)],
              notes: 'Seeded historical request',
              createdAt: created, submittedAt: submitted, decidedAt: decided,
            }));
          }
        }
      }
    }
  }

  // --- Upcoming appointments: today + next 3 days ---
  for (let daysAhead = 0; daysAhead <= 3; daysAhead++) {
    const day = new Date(now);
    day.setDate(day.getDate() + daysAhead);
    if (day.getDay() === 0 || day.getDay() === 6) continue;

    for (const doc of doctorUsers.slice(0, 8)) {
      const used = new Set<number>();
      for (let b = 0; b < 3 + rand(3); b++) {
        const hour = 9 + rand(8);
        const minute = rand(2) * 30;
        const key = hour * 100 + minute;
        if (used.has(key)) continue;
        used.add(key);
        const start = atHour(day, hour, minute);
        if (start <= now) continue;
        await appts.save(appts.create({
          patientId: patientUsers[rand(patientUsers.length)].id,
          doctorId: doc.user.id,
          startTime: start,
          endTime: new Date(start.getTime() + 30 * 60000),
          status: AppointmentStatus.SCHEDULED,
          reason: ['Chest discomfort', 'Skin rash', 'Knee pain', 'Routine check-up'][rand(4)],
          createdById: receptionist.id,
        }));
      }
    }
  }

  // Guaranteed demo appointment for the demo patient within 24h (intake chatbot trigger)
  const demoPatient = patientUsers[0];
  const gp = doctorUsers[0];
  const demoStart = new Date(now.getTime() + 3 * 3600000);
  demoStart.setMinutes(demoStart.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (demoStart.getMinutes() === 0) demoStart.setHours(demoStart.getHours() + 1);
  try {
    await appts.save(appts.create({
      patientId: demoPatient.id, doctorId: gp.user.id,
      startTime: demoStart, endTime: new Date(demoStart.getTime() + 30 * 60000),
      status: AppointmentStatus.SCHEDULED, reason: 'Persistent headache',
      createdById: demoPatient.id,
    }));
  } catch {
    // slot already taken by random seed data — fine for demo purposes
  }

  console.log('Seed complete.');
  console.log(`Users: 1 admin, 1 receptionist, ${DOCTORS.length} doctors, ${PATIENTS.length} patients (password: ${PASSWORD})`);
  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
