import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Appointment, LabFile, PreAuth, VisitRecord } from '../entities';
import { PreAuthStatus, Role } from '../common/enums';
import { JwtUser } from '../common/decorators';
import { EmbeddingService } from '../embedding/embedding.service';
import { vectorToSql } from '../embedding/vector-sql';
import { CreateRecordDto, UpdateRecordDto } from './dto';

@Injectable()
export class RecordsService {
  private logger = new Logger('RecordsService');

  constructor(
    @InjectRepository(VisitRecord) private records: Repository<VisitRecord>,
    @InjectRepository(Appointment) private appointments: Repository<Appointment>,
    @InjectRepository(PreAuth) private preauths: Repository<PreAuth>,
    @InjectRepository(LabFile) private files: Repository<LabFile>,
    private embeddings: EmbeddingService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  private toDto(r: VisitRecord) {
    return {
      id: r.id,
      appointmentId: r.appointmentId,
      patientId: r.patientId,
      doctorId: r.doctorId,
      subjective: r.subjective,
      objective: r.objective,
      assessment: r.assessment,
      plan: r.plan,
      icdCodes: r.icdCodes,
      finalized: r.finalized,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      patient: r.patient ? { id: r.patient.id, fullName: r.patient.fullName } : undefined,
      doctor: r.doctor ? { id: r.doctor.id, fullName: r.doctor.fullName } : undefined,
      appointment: r.appointment
        ? { startTime: r.appointment.startTime, status: r.appointment.status }
        : undefined,
      files: (r.files || []).map((f) => ({
        id: f.id, filename: f.filename, size: f.size, mimetype: f.mimetype,
      })),
    };
  }

  async list(user: JwtUser, patientId?: string) {
    const qb = this.records
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.files', 'files')
      .leftJoinAndSelect('r.patient', 'patient')
      .leftJoinAndSelect('r.doctor', 'doctor')
      .leftJoinAndSelect('r.appointment', 'appointment')
      .orderBy('r.createdAt', 'DESC');

    if (user.role === Role.PATIENT) {
      qb.where('r."patientId" = :uid', { uid: user.id });
    } else if (user.role === Role.DOCTOR) {
      qb.where('r."doctorId" = :uid', { uid: user.id });
      if (patientId) qb.andWhere('r."patientId" = :pid', { pid: patientId });
    } else {
      throw new ForbiddenException('Records are visible to patients and doctors only');
    }
    const rows = await qb.getMany();
    return rows.map((r) => this.toDto(r));
  }

  async getOne(user: JwtUser, id: string) {
    const record = await this.records.findOne({
      where: { id },
      relations: { files: true, patient: true, doctor: true, appointment: true },
    });
    if (!record) throw new NotFoundException('Record not found');
    this.assertCanView(user, record);
    return this.toDto(record);
  }

  private assertCanView(user: JwtUser, record: VisitRecord) {
    if (user.role === Role.PATIENT && record.patientId !== user.id) throw new ForbiddenException();
    if (user.role === Role.DOCTOR && record.doctorId !== user.id) throw new ForbiddenException();
    if ([Role.RECEPTIONIST, Role.ADMIN].includes(user.role)) throw new ForbiddenException();
  }

  async create(user: JwtUser, dto: CreateRecordDto) {
    const appt = await this.appointments.findOneBy({ id: dto.appointmentId });
    if (!appt) throw new NotFoundException('Appointment not found');
    if (appt.doctorId !== user.id) {
      throw new ForbiddenException('Only the assigned doctor can create the visit record');
    }
    const existing = await this.records.findOneBy({ appointmentId: dto.appointmentId });
    if (existing) throw new BadRequestException('Record already exists for this appointment');

    const record = await this.records.save(
      this.records.create({
        appointmentId: appt.id,
        patientId: appt.patientId,
        doctorId: appt.doctorId,
        subjective: dto.subjective ?? '',
        objective: dto.objective ?? '',
        assessment: dto.assessment ?? '',
        plan: dto.plan ?? '',
        icdCodes: dto.icdCodes ?? [],
      }),
    );
    return this.getOne(user, record.id);
  }

  async update(user: JwtUser, id: string, dto: UpdateRecordDto) {
    const record = await this.records.findOne({
      where: { id },
      relations: { appointment: { doctor: { doctorProfile: true } } },
    });
    if (!record) throw new NotFoundException('Record not found');
    if (record.doctorId !== user.id) throw new ForbiddenException();
    if (record.finalized) throw new BadRequestException('Record is finalized');

    if (dto.subjective !== undefined) record.subjective = dto.subjective;
    if (dto.objective !== undefined) record.objective = dto.objective;
    if (dto.assessment !== undefined) record.assessment = dto.assessment;
    if (dto.plan !== undefined) record.plan = dto.plan;
    if (dto.icdCodes !== undefined) record.icdCodes = dto.icdCodes;

    if (dto.finalize) {
      const specialty = record.appointment?.doctor?.doctorProfile?.specialty;
      if (specialty && specialty !== 'General Practice') {
        const approved = await this.preauths.findOneBy({
          appointmentId: record.appointmentId,
          status: PreAuthStatus.APPROVED,
        });
        if (!approved) {
          throw new ForbiddenException('PREAUTH_NOT_APPROVED');
        }
      }
      record.finalized = true;
    }

    await this.records.save(record);

    if (dto.finalize) {
      // Best-effort: powers "similar past visits" retrieval in the Smart
      // Recommender (see KnowledgeService.searchPatientHistory). Never blocks
      // or fails the save — embeddings degrade gracefully like the rest of
      // the AI features.
      await this.embedRecord(record);
    }

    return this.getOne(user, id);
  }

  private async embedRecord(record: VisitRecord): Promise<void> {
    const text = [record.subjective, record.assessment, record.plan].filter(Boolean).join('\n');
    if (!text) return;
    const vector = await this.embeddings.embed(text);
    if (!vector) return;
    try {
      await this.dataSource.query(
        `UPDATE visit_records SET embedding = $1::vector WHERE id = $2`,
        [vectorToSql(vector), record.id],
      );
    } catch (err) {
      this.logger.warn(`Failed to store visit record embedding: ${(err as Error).message}`);
    }
  }

  async attachFile(user: JwtUser, id: string, file: Express.Multer.File) {
    const record = await this.records.findOneBy({ id });
    if (!record) throw new NotFoundException('Record not found');
    if (record.doctorId !== user.id) throw new ForbiddenException();

    const saved = await this.files.save(
      this.files.create({
        recordId: id,
        filename: file.originalname,
        storedPath: file.path,
        mimetype: file.mimetype,
        size: file.size,
      }),
    );
    return { id: saved.id, filename: saved.filename, size: saved.size, mimetype: saved.mimetype };
  }

  async getFile(user: JwtUser, recordId: string, fileId: string) {
    const record = await this.records.findOneBy({ id: recordId });
    if (!record) throw new NotFoundException('Record not found');
    this.assertCanView(user, record);
    const file = await this.files.findOneBy({ id: fileId, recordId });
    if (!file) throw new NotFoundException('File not found');
    const absolute = path.resolve(file.storedPath);
    if (!fs.existsSync(absolute)) throw new NotFoundException('File missing on disk');
    return { file, absolute };
  }
}
