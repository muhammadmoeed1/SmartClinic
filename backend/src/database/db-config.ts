import type { DataSourceOptions } from 'typeorm';
import * as path from 'path';

/**
 * Shared TypeORM connection options used by both the Nest app (app.module.ts)
 * and the standalone CLI DataSource (data-source.ts / run-migrations.ts).
 *
 * Two configuration modes:
 *   1. DATABASE_URL  — a single Postgres connection string (Neon, Render, Heroku…).
 *      SSL is enabled automatically for managed providers.
 *   2. DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME — individual vars (local dev).
 */
export function buildDbConfig(): DataSourceOptions {
  const entities = [path.join(__dirname, '../entities/*.entity.{ts,js}')];
  const migrations = [path.join(__dirname, 'migrations/*.{ts,js}')];

  // Managed providers give a single connection string. Enable SSL unless the
  // URL points at localhost (local Postgres started from docker-compose).
  const url = process.env.DATABASE_URL;
  if (url) {
    const isLocal = /@(localhost|127\.0\.0\.1|db)[:/]/.test(url);
    return {
      type: 'postgres',
      url,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      entities,
      migrations,
      synchronize: false,
    };
  }

  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'smartclinic',
    password: process.env.DB_PASSWORD || 'smartclinic',
    database: process.env.DB_NAME || 'smartclinic',
    entities,
    migrations,
    synchronize: false,
  };
}
