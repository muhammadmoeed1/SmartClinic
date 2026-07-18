import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePgvector1720000000001 implements MigrationInterface {
  name = 'EnablePgvector1720000000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP EXTENSION IF EXISTS vector`);
  }
}
