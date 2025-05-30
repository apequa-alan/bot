import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Signal } from './entities/signal.entity';

interface SignalMetrics {
  totalSignals: number;
  successRate: number;
  averageProfit: number;
  averageLoss: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  winStreak: number;
  lossStreak: number;
  averageHoldingTime: number;
}

@Injectable()
export class SignalMetricsService {
  constructor(
    @InjectRepository(Signal)
    private readonly signalRepository: Repository<Signal>,
  ) {}

  async calculateMetrics(timeframe: 'day' | 'week' | 'month' | 'all', symbol?: string): Promise<SignalMetrics> {
    const startDate = this.getStartDate(timeframe);
    const query = this.signalRepository.createQueryBuilder('signal')
      .where('signal.createdAt >= :startDate', { startDate });

    if (symbol) {
      query.andWhere('signal.symbol = :symbol', { symbol });
    }

    const signals = await query.getMany();
    return this.calculateMetricsFromSignals(signals);
  }

  private getStartDate(timeframe: 'day' | 'week' | 'month' | 'all'): Date {
    const now = new Date();
    switch (timeframe) {
      case 'day':
        return new Date(now.setDate(now.getDate() - 1));
      case 'week':
        return new Date(now.setDate(now.getDate() - 7));
      case 'month':
        return new Date(now.setMonth(now.getMonth() - 1));
      case 'all':
        return new Date(0);
    }
  }

  private calculateMetricsFromSignals(signals: Signal[]): SignalMetrics {
    if (signals.length === 0) {
      return {
        totalSignals: 0,
        successRate: 0,
        averageProfit: 0,
        averageLoss: 0,
        profitFactor: 0,
        bestTrade: 0,
        worstTrade: 0,
        winStreak: 0,
        lossStreak: 0,
        averageHoldingTime: 0,
      };
    }

    const profits = signals.map(s => s.profitLoss ?? 0);
    const successfulTrades = profits.filter(p => p > 0);
    const losingTrades = profits.filter(p => p < 0);

    const currentStreak = { wins: 0, losses: 0 };
    const maxStreak = { wins: 0, losses: 0 };

    profits.forEach(profit => {
      if (profit > 0) {
        currentStreak.wins++;
        currentStreak.losses = 0;
        maxStreak.wins = Math.max(maxStreak.wins, currentStreak.wins);
      } else if (profit < 0) {
        currentStreak.losses++;
        currentStreak.wins = 0;
        maxStreak.losses = Math.max(maxStreak.losses, currentStreak.losses);
      }
    });

    const totalProfit = successfulTrades.reduce((sum, p) => sum + p, 0);
    const totalLoss = Math.abs(losingTrades.reduce((sum, p) => sum + p, 0));

    return {
      totalSignals: signals.length,
      successRate: (successfulTrades.length / signals.length) * 100,
      averageProfit: successfulTrades.length ? totalProfit / successfulTrades.length : 0,
      averageLoss: losingTrades.length ? totalLoss / losingTrades.length : 0,
      profitFactor: totalLoss ? totalProfit / totalLoss : 0,
      bestTrade: Math.max(...profits),
      worstTrade: Math.min(...profits),
      winStreak: maxStreak.wins,
      lossStreak: maxStreak.losses,
      averageHoldingTime: this.calculateAverageHoldingTime(signals),
    };
  }

  private calculateAverageHoldingTime(signals: Signal[]): number {
    const holdingTimes = signals
      .filter(s => s.closedAt && s.createdAt)
      .map(s => s.closedAt!.getTime() - s.createdAt!.getTime());

    return holdingTimes.length
      ? holdingTimes.reduce((sum, time) => sum + time, 0) / holdingTimes.length
      : 0;
  }
} 