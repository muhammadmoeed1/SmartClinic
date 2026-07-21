import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { NoShowService } from './no-show.service';
import { LlmObservabilityService } from './llm-observability.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { AiUnavailableException } from './llm.client';
import {
  IntakeMessageDto, ManualIntakeDto, ObservabilityQueryDto, RecommendDto, RiskQueryDto,
  SoapFormatDto,
} from './dto';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private ai: AiService,
    private noShow: NoShowService,
    private llmObservability: LlmObservabilityService,
    private knowledge: KnowledgeService,
  ) {}

  @Post('recommend')
  @Roles(Role.PATIENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI Feature 2 — specialty recommendation from free text' })
  recommend(@CurrentUser() user: JwtUser, @Body() dto: RecommendDto) {
    return this.ai.recommend(user, dto.description);
  }

  @Post('intake/start')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'AI Feature 1 — start intake chatbot session (appointment within 24h required)' })
  startIntake(@CurrentUser() user: JwtUser) {
    return this.ai.startIntake(user);
  }

  @Post('intake/message')
  @Roles(Role.PATIENT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI Feature 1 — send a message in the intake conversation' })
  intakeMessage(@CurrentUser() user: JwtUser, @Body() dto: IntakeMessageDto) {
    return this.ai.intakeMessage(user, dto.sessionId, dto.message);
  }

  @Post('intake/message/stream')
  @Roles(Role.PATIENT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'AI Feature 1 (streaming) — same as intake/message, but streamed as Server-Sent Events',
  })
  async intakeMessageStream(
    @CurrentUser() user: JwtUser,
    @Body() dto: IntakeMessageDto,
    @Res() res: Response,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of this.ai.intakeMessageStream(user, dto.sessionId, dto.message)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      const payload = err instanceof AiUnavailableException
        ? { type: 'error', fallback: true }
        : { type: 'error', fallback: false };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } finally {
      res.end();
    }
  }

  @Post('intake/manual')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'AI Feature 1 fallback — static intake form submission' })
  manualIntake(@CurrentUser() user: JwtUser, @Body() dto: ManualIntakeDto) {
    const { appointmentId, ...data } = dto;
    return this.ai.manualIntake(user, appointmentId, { ...data, redFlags: data.redFlags ?? [] });
  }

  @Get('triage/:appointmentId')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Triage summary for a doctor’s appointment' })
  getTriage(
    @CurrentUser() user: JwtUser,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
  ) {
    return this.ai.getTriage(user, appointmentId);
  }

  @Post('soap-format')
  @Roles(Role.DOCTOR)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI Feature 3 — format raw notes into SOAP + ICD-10 suggestions' })
  soapFormat(@Body() dto: SoapFormatDto) {
    return this.ai.soapFormat(dto.rawNotes);
  }

  @Get('no-show-risk')
  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @ApiOperation({ summary: 'AI Feature 4 — no-show risk scores for a date (flag > 0.65)' })
  noShowRisk(@Query() query: RiskQueryDto) {
    return this.noShow.scoresForDate(query.date);
  }

  @Get('observability')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'LLM observability — calls, latency, token usage, success rate by feature' })
  async observability(@Query() query: ObservabilityQueryDto) {
    const since = query.sinceHours
      ? new Date(Date.now() - Number(query.sinceHours) * 3600000)
      : undefined;
    return {
      llmCalls: await this.llmObservability.statsByFeature(since),
      ragCache: this.knowledge.cacheStats,
    };
  }
}
