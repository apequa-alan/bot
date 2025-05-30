import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('signals')
export class Signal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  symbol: string;

  @Column()
  interval: string;

  @Column()
  type: 'long' | 'short';

  @Column('float')
  entryPrice: number;

  @Column('float')
  takeProfit: number;

  @Column('bigint')
  timestamp: number;

  @Column()
  status: 'success' | 'failure' | 'active';

  @Column('float', { nullable: true })
  exitPrice: number | null;

  @Column('bigint', { nullable: true })
  exitTimestamp: number | null;

  @Column('float', { nullable: true })
  profitLoss: number | null;

  @Column()
  entryTime: string;

  @Column()
  active: boolean;

  @Column('float')
  maxProfit: number;

  @Column()
  notified: boolean;

  @Column()
  messageId: number;

  @Column('int', { nullable: true })
  validityHours: number;
} 