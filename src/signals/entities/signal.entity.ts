import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { dayjs } from '../../utils';

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

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  convertToUTC() {
    if (this.createdAt) {
      this.createdAt = dayjs(this.createdAt).utc().toDate();
    }
    if (this.updatedAt) {
      this.updatedAt = dayjs(this.updatedAt).utc().toDate();
    }
  }
}
