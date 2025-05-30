import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('signals')
export class Signal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  symbol: string;

  @Column()
  interval: string;

  @Column()
  type: 'long' | 'short';

  @Column('decimal', { precision: 10, scale: 2 })
  entryPrice: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  takeProfit?: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  stopLoss?: number;

  @Column({ default: 'active' })
  status: 'active' | 'success' | 'failure';

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  exitPrice?: number;

  @Column('float', { nullable: true })
  profitLoss: number | null;

  @Column('float', { default: 0 })
  maxProfit: number;

  @Column({ default: false })
  notified: boolean;

  @Column({ nullable: true })
  messageId: number;

  @Column('int', { nullable: true })
  validityHours: number;

  @Column('bigint')
  timestamp: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  closedAt?: Date;

  @UpdateDateColumn()
  updatedAt: Date;
} 