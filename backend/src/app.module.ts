import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { buildDbConfig } from './database/db-config';

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
    ScheduleModule.forRoot(),
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
  ],
  providers: [
    // Global guards: every route requires a valid JWT unless marked @Public();
    // @Roles(...) further restricts by role.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
