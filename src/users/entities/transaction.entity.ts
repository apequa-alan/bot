import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserPlan } from '../../config/plan.config';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: ['pro', 'premium'],
  })
  plan: UserPlan;

  @Column({ type: 'varchar' })
  telegramPaymentChargeId: string;

  @Column({ type: 'varchar' })
  telegramPaymentInvoiceId: string;

  @Column({ type: 'varchar' })
  currency: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerPaymentChargeId: string | null;

  @Column({ type: 'varchar', nullable: true })
  shippingOptionId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  orderInfo: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
