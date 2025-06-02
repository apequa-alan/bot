import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column()
  status: 'success' | 'failure' | 'active';

  @Column()
  messageId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
