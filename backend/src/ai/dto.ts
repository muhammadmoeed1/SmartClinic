import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, Min,
} from 'class-validator';

export class RecommendDto {
  @ApiProperty({ example: 'I have had a sharp pain in my knee for two weeks' })
  @IsString()
  @IsNotEmpty()
  description: string;
}

export class IntakeMessageDto {
  @ApiProperty()
  @IsUUID()
  sessionId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message: string;
}

export class ManualIntakeDto {
  @ApiProperty()
  @IsUUID()
  appointmentId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  chiefComplaint: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  symptomDurationDays: number;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  severity: number;

  @ApiProperty()
  @IsString()
  relevantHistory: string;

  @ApiProperty()
  @IsString()
  currentMedications: string;

  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsString({ each: true })
  redFlags: string[] = [];
}

export class SoapFormatDto {
  @ApiProperty({ example: 'pt c/o lower back pain 2wks, worse on bending...' })
  @IsString()
  @IsNotEmpty()
  rawNotes: string;
}

export class RiskQueryDto {
  @ApiProperty({ example: '2026-07-15' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;
}

export class ObservabilityQueryDto {
  @ApiProperty({ required: false, example: '24', description: 'Only include calls from the last N hours' })
  @IsOptional()
  @Matches(/^\d+$/, { message: 'sinceHours must be a positive integer' })
  sinceHours?: string;
}
