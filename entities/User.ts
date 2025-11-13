import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  name!: string;

  @Column()
  password!: string;

  @OneToMany('Transcription', 'user')
  transcriptions!: any[];

  @OneToMany('Dictionary', 'user')
  dictionary!: any[];

  @CreateDateColumn()
  createdAt!: Date;
}
