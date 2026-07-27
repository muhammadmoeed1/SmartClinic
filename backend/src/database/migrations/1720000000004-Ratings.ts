import { MigrationInterface, QueryRunner } from 'typeorm';

/** One rating per completed appointment: the patient's 1-5 star score plus
 * an optional comment, powering the doctor's average rating (shown on
 * booking cards / admin doctor list) and the "rate your visit" prompt on
 * the patient dashboard. */
export class Ratings1720000000004 implements MigrationInterface {
  name = 'Ratings1720000000004';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "ratings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "appointmentId" uuid NOT NULL UNIQUE REFERENCES "appointments"("id") ON DELETE CASCADE,
        "patientId" uuid NOT NULL,
        "doctorId" uuid NOT NULL,
        "score" smallint NOT NULL,
        "comment" text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "ratings_doctor_idx" ON "ratings" ("doctorId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "ratings"`);
  }
}
