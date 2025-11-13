import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn, Index } from 'typeorm';

@Entity('dictionary')
@Index('IDX_dictionary_user', ['userId'])
@Index('IDX_dictionary_user_created_at', ['userId', 'createdAt'])
export class Dictionary {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @ManyToOne('User', 'dictionary', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: any;

  @Column()
  word!: string;

  @Column({ nullable: true, type: 'text' })
  context!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
