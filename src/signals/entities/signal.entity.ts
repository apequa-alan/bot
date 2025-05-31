import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('signals')
export class Signal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  symbol: string;

  @Column()
  interval: string;

  @Column()
  type: 'long' | 'short';

  @Column('decimal', { precision: 20, scale: 8 })
  entryPrice: number;

  @Column('float')
  takeProfit: number;

  @Column('bigint')
  timestamp: number;

  @Column()
  status: 'success' | 'failure' | 'active';

  @Column('float', { nullable: true })
  exitPrice: number | null;

  @Column({ nullable: true, type: 'datetime' })
  exitTimestamp: Date | null;

  @Column('float', { nullable: true })
  profitLoss: number | null;

  @Column()
  entryTime: string;

  @Column()
  active: boolean;

  @Column('float')
  maxProfit: number;

  @Column({ default: false })
  notified: boolean;

  @Column()
  messageId: number;

  @Column('int', { nullable: true })
  validityHours: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
} 