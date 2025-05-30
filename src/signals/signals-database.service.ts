import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Signal } from './entities/signal.entity';
import { LessThan, In } from 'typeorm';

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
        status: status as Signal['status'],
        exitPrice,
        profitLoss,
        closedAt: new Date(),
      },
    );
  }

  async getActiveSignals(): Promise<Signal[]> {
    return this.signalsRepository.find({
      where: { status: 'active' },
    });
  }

  async getSignalStats(): Promise<any[]> {
    return this.signalsRepository
      .createQueryBuilder('signal')
      .select('signal.symbol', 'symbol')
      .addSelect('COUNT(*)', 'total_signals')
      .addSelect('SUM(CASE WHEN signal.status = :success THEN 1 ELSE 0 END)', 'profitable_signals')
      .addSelect('SUM(CASE WHEN signal.status = :failure THEN 1 ELSE 0 END)', 'failure_signals')
      .addSelect('AVG(signal.profitLoss)', 'avg_profit_loss')
      .where('signal.status IN (:...statuses)', { statuses: ['success', 'failure'] })
      .setParameter('success', 'success')
      .setParameter('failure', 'failure')
      .groupBy('signal.symbol')
      .getRawMany();
  }

  async cleanupOldSignals(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
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
} 