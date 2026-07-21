import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('llm_calls')
export class LlmCall {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  feature: string;

  @Column()
  provider: string;

  @Column()
  model: string;

  @Column({ type: 'varchar', nullable: true })
  promptVersion: string | null;

  @Column({ type: 'varchar', nullable: true })
  toolName: string | null;

  @Column()
  latencyMs: number;

  @Column({ type: 'integer', nullable: true })
  inputTokens: number | null;

  @Column({ type: 'integer', nullable: true })
  outputTokens: number | null;

  @Column()
  success: boolean;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
