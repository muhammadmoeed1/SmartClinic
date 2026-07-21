import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Appointment, DoctorProfile, LlmCall, TriageSummary, VisitRecord,
} from '../entities';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { LlmClient } from './llm.client';
import { LlmObservabilityService } from './llm-observability.service';
import { NoShowService } from './no-show.service';
import { SessionStore } from '../common/session-store';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, TriageSummary, VisitRecord, DoctorProfile, LlmCall]),
    KnowledgeModule,
  ],
  controllers: [AiController],
  providers: [
    AiService,
    LlmClient,
    LlmObservabilityService,
    NoShowService,
    // Plain class registration would make Nest try to DI-resolve the
    // `namespace: string` constructor param (and fail — there's no provider
    // for a bare `String` token). A factory sidesteps that entirely.
    { provide: SessionStore, useFactory: () => new SessionStore('session') },
  ],
})
export class AiModule {}
