import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}

async function bootstrap() {
  // bufferLogs holds Nest's startup logs until the pino Logger below takes
  // over, so nothing is lost/printed with the default (unstructured) logger.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.enableCors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('SmartClinic API')
    .setDescription('AI-augmented outpatient management platform — REST + WebSocket API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  console.log(`SmartClinic API listening on http://localhost:${port} (Swagger: /api)`);
}
bootstrap();
