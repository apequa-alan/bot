import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserPlan } from '../../config/plan.config';

@Entity('users')
export class User {
  @PrimaryColumn()
  id: string;

  @Column({
    type: 'enum',
    enum: ['free', 'pro', 'premium'],
    default: 'free',
  })
  plan: UserPlan;

  @Column({ type: 'int', default: 3 })
  subscriptionLimit: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  subscriptionExpiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
