import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString, IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, Matches,
} from 'class-validator';
import { AppointmentStatus } from '../common/enums';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class SlotsQueryDto {
  @ApiProperty()
  @IsUUID()
  doctorId: string;

  @ApiProperty({ example: '2026-07-15' })
  @Matches(DATE_RE, { message: 'date must be YYYY-MM-DD' })
  date: string;
}

export class CreateAppointmentDto {
  @ApiProperty()
  @IsUUID()
  doctorId: string;

  @ApiProperty({ example: '2026-07-15T09:30:00.000Z' })
  @IsISO8601()
  startTime: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false, description: 'Receptionist booking on behalf of a patient' })
  @IsOptional()
  @IsUUID()
  patientId?: string;
}

export class UpdateAppointmentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @ApiProperty({ required: false, enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}

export class ListAppointmentsQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(DATE_RE, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @ApiProperty({ required: false, description: 'Open-ended range: all appointments on/after this date' })
  @IsOptional()
  @Matches(DATE_RE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiProperty({ required: false, enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  doctorId?: string;
}

export class JoinWaitlistDto {
  @ApiProperty()
  @IsUUID()
  doctorId: string;

  @ApiProperty({ example: '2026-07-15' })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  patientId?: string;
}
