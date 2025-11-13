import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn, Index } from 'typeorm';
import { User } from './User';

@Entity('transcriptions')
@Index('IDX_transcriptions_user', ['userId'])
@Index('IDX_transcriptions_user_created_at', ['userId', 'createdAt'])
export class Transcription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => User, (user) => user.transcriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column('text')
  text!: string;

  @Column({ nullable: true, type: 'double precision' })
  duration!: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
