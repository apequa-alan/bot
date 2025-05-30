import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('subscriptions')
export class SubscriptionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'text' })
  userId: string;

  @Column({ type: 'text' })
  symbol: string;

  @Column({ type: 'text' })
  interval: string;

  @Column({ name: 'take_profit', type: 'real' })
  takeProfit: number;
} 