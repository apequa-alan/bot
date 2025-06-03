import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { dayjs } from '../utils';

import { Between, In, LessThan, Repository } from 'typeorm';
import { Signal } from './entities/signal.entity';

@Injectable()
export class SignalsDatabaseService {
  constructor(
    @InjectRepository(Signal)
    private signalsRepository: Repository<Signal>,
  ) {}

  async saveSignal(signal: Signal): Promise<void> {
    await this.signalsRepository.save(signal);
  }

  async updateSignalStatus(
    signalId: string,
    status: Signal['status'],
  ): Promise<void> {
    await this.signalsRepository.update(
      { id: signalId, status: 'active' as Signal['status'] },
      { status },
    );
  }

  async getActiveSignals(userId?: string): Promise<Signal[]> {
    return this.signalsRepository.find(
      userId
        ? {
            where: { status: 'active', userId },
          }
        : {
            where: { status: 'active' },
          },
    );
  }

  async getSignalStats(userId: string) {
    const today = dayjs().startOf('day');
    const tomorrow = today.add(1, 'day');

    const signals = await this.signalsRepository.find({
      where: {
        userId,
        createdAt: Between(today.toDate(), tomorrow.toDate()),
      },
    });

    const totalSignals = signals.length;
    const profitableSignals = signals.filter(
      (signal) => signal.status === 'success',
    ).length;

    return {
      totalSignals,
      profitableSignals,
    };
  }

  async cleanupOldSignals(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = dayjs().subtract(daysToKeep, 'day').toDate();
    await this.signalsRepository.delete({
      createdAt: LessThan(cutoffDate),
      status: In(['success', 'failure']),
    });
  }

  async getSignalBySymbol(symbol: string): Promise<Signal | null> {
    return this.signalsRepository.findOne({
      where: { symbol, status: 'active' },
    });
  }

  async updateSignal(signal: Signal): Promise<void> {
    await this.signalsRepository.update(
      { id: signal.id },
      { messageId: signal.messageId },
    );
  }
}
