import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { buildDbConfig } from './database/db-config';
import { MetricsModule } from './metrics/metrics.module';
import { SentryInterceptor } from './common/sentry.interceptor';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { RecordsModule } from './records/records.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PreAuthModule } from './preauth/preauth.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AiModule } from './ai/ai.module';
import { HealthModule } from './health/health.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Structured JSON logs (pretty-printed outside production) with a
    // request ID on every log line, for log aggregation / tracing a request
    // across multiple log statements.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
        redact: ['req.headers.authorization'],
        transport: process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
      },
    }),
    ScheduleModule.forRoot(),
    // Default rate limit for all routes; AI endpoints set a stricter
    // per-route limit via @Throttle() since they're the costly ones to abuse.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
    }),
    TypeOrmModule.forRoot({
      ...buildDbConfig(),
      autoLoadEntities: true,
    }),
    AuthModule,
    UsersModule,
    AppointmentsModule,
    RecordsModule,
    NotificationsModule,
    PreAuthModule,
    AnalyticsModule,
    AiModule,
    HealthModule,
    MetricsModule,
  ],
  providers: [
    // Global guards, applied in order: rate limit first (protects even
    // unauthenticated requests), then a valid JWT is required unless the
    // route is marked @Public(), then @Roles(...) further restricts by role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Observes unexpected errors for Sentry without altering the response —
    // no-ops entirely when SENTRY_DSN isn't set.
    { provide: APP_INTERCEPTOR, useClass: SentryInterceptor },
  ],
})
export class AppModule {}
