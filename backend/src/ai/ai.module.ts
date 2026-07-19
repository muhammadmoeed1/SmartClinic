import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Appointment, DoctorProfile, TriageSummary, VisitRecord,
} from '../entities';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { LlmClient } from './llm.client';
import { NoShowService } from './no-show.service';
import { SessionStore } from './session-store';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, TriageSummary, VisitRecord, DoctorProfile]),
    KnowledgeModule,
  ],
  controllers: [AiController],
  providers: [AiService, LlmClient, NoShowService, SessionStore],
})
export class AiModule {}
