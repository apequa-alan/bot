import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
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
    symbol: string,
    status: Signal['status'],
    exitPrice?: number,
    profitLoss?: number,
  ): Promise<void> {
    await this.signalsRepository.update(
      { symbol, status: 'active' as Signal['status'] },
      {
        status: status,
        exitPrice,
        profitLoss,
        exitTimestamp: Date.now(),
      },
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

  async getSignalStats(userId: string): Promise<any[]> {
    return this.signalsRepository
      .createQueryBuilder('signal')
      .select('signal.symbol', 'symbol')
      .addSelect('COUNT(*)', 'total_signals')
      .addSelect(
        'SUM(CASE WHEN signal.status = :success THEN 1 ELSE 0 END)',
        'profitable_signals',
      )
      .addSelect(
        'SUM(CASE WHEN signal.status = :failure THEN 1 ELSE 0 END)',
        'failure_signals',
      )
      .addSelect('AVG(signal.profitLoss)', 'avg_profit_loss')
      .where('signal.status IN (:...statuses)', {
        statuses: ['success', 'failure'],
      })
      .andWhere('signal.userId = :userId', { userId })
      .setParameter('success', 'success')
      .setParameter('failure', 'failure')
      .groupBy('signal.symbol')
      .getRawMany();
  }

  async cleanupOldSignals(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    await this.signalsRepository.delete({
      timestamp: LessThan(cutoffDate),
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
