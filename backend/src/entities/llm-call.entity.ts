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

  @Column({ nullable: true })
  promptVersion: string | null;

  @Column({ nullable: true })
  toolName: string | null;

  @Column()
  latencyMs: number;

  @Column({ nullable: true })
  inputTokens: number | null;

  @Column({ nullable: true })
  outputTokens: number | null;

  @Column()
  success: boolean;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
