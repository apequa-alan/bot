import { Injectable } from '@nestjs/common';
import { SignalsDatabaseService } from './signals-database.service';
import { Signal } from './entities/signal.entity';
import { SignalUpdateService } from '../telegram/services/signal-update.service';
import { SignalDispatcherService } from './signal-dispatcher.service';

@Injectable()
export class SignalsService {
  constructor(
    private readonly signalsDb: SignalsDatabaseService,
    private readonly signalUpdate: SignalUpdateService,
    private readonly signalDispatcher: SignalDispatcherService,
  ) {}

  async createSignal(signal: Signal): Promise<void> {
    // Check if symbol already has an active signal
    const activeSignals = await this.getActiveSignals();
    if (activeSignals.some(s => s.symbol === signal.symbol && s.status === 'active')) {
      console.log(`${signal.symbol}: Уже есть активный сигнал, новый не генерируется`);
      return;
    }

    await this.signalsDb.saveSignal(signal);
    
    // Dispatch signal to channel and subscribers
    await Promise.all([
      this.signalDispatcher.dispatchToChannel(signal),
      this.signalDispatcher.dispatchToSubscribers(signal)
    ]);
  }

  async updateSignalStatus(
    symbol: string,
    status: Signal['status'],
    currentPrice: number,
    profitLoss: number,
  ): Promise<void> {
    const signal = await this.signalsDb.getSignalBySymbol(symbol);
    if (!signal) return;

    await this.signalsDb.updateSignalStatus(symbol, status, currentPrice, profitLoss);
    
    // Broadcast update to subscribed users
    await this.signalUpdate.broadcastUpdate(signal, currentPrice, profitLoss);
  }

  async getActiveSignals(): Promise<Signal[]> {
    return this.signalsDb.getActiveSignals();
  }

  async getSignalStats(): Promise<any[]> {
    return this.signalsDb.getSignalStats();
  }

  async cleanupOldSignals(daysToKeep: number = 30): Promise<void> {
    await this.signalsDb.cleanupOldSignals(daysToKeep);
  }

  async checkSignalProfit(
    {symbol, currentPrice, highPrice, lowPrice, profitConfig}: {
      symbol: string,
      currentPrice: number,
      highPrice: number,
      lowPrice: number,
      profitConfig: { profit: number; validityHours: number },
    }
  ): Promise<void> {
    const activeSignals = await this.getActiveSignals();
    const symbolSignals = activeSignals.filter(
      (signal) => signal.symbol === symbol && signal.status === 'active',
    );

    if (!symbolSignals.length) return;

    for (const signal of symbolSignals) {
      let profitPercent = 0;
      let maxPossibleProfitPercent = 0;

      if (signal.type === 'long') {
        profitPercent = ((currentPrice - signal.entryPrice) / signal.entryPrice) * 100;
        maxPossibleProfitPercent = ((highPrice - signal.entryPrice) / signal.entryPrice) * 100;
      } else if (signal.type === 'short') {
        profitPercent = ((signal.entryPrice - currentPrice) / signal.entryPrice) * 100;
        maxPossibleProfitPercent = ((signal.entryPrice - lowPrice) / signal.entryPrice) * 100;
      }

      if (maxPossibleProfitPercent > signal.maxProfit) {
        signal.maxProfit = maxPossibleProfitPercent;
      }

      // Check if signal has expired based on validity hours
      const signalAge = (Date.now() - signal.timestamp) / (1000 * 60 * 60); // Convert to hours
      const isExpired = signalAge >= signal.validityHours;

      if (isExpired && !signal.notified) {
        signal.notified = true;
        await this.updateSignalStatus(
          symbol,
          'failure',
          currentPrice,
          profitPercent,
        );
      } else if (signal.maxProfit >= profitConfig.profit && !signal.notified) {
        signal.notified = true;
        await this.updateSignalStatus(
          symbol,
          'success',
          currentPrice,
          signal.maxProfit,
        );
      }
    }
  }
} 