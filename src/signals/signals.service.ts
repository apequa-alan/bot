import { Injectable } from '@nestjs/common';
import { SignalsDatabaseService } from './signals-database.service';
import { Signal } from './entities/signal.entity';
import { TelegramService } from '../telegram/telegram.service';
import { SubscriptionsService } from '../trading-bot/subscriptions/subscriptions.service';

@Injectable()
export class SignalsService {
  constructor(
    private readonly signalsDb: SignalsDatabaseService,
    private readonly telegramService: TelegramService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async createSignal(signal: Signal, userId: string): Promise<void> {
    const activeSignals = await this.getActiveSignals(userId);
    if (
      activeSignals.some(
        (s) =>
          s.symbol === signal.symbol &&
          s.interval === signal.interval &&
          s.status === 'active',
      )
    ) {
      console.log(
        `${signal.symbol}|${signal.interval}: Уже есть активный сигнал, новый не генерируется`,
      );
      return;
    }

    await this.signalsDb.saveSignal(signal);

    // Notify subscribers
    const subscribers = await this.subscriptionsService.getSubscribersForSignal(
      signal.symbol,
      signal.interval,
    );

    for (const subscriber of subscribers) {
      try {
        const message = this.formatSignalMessage(signal, subscriber);
        await this.telegramService.sendDirectMessage(
          subscriber.userId,
          message,
        );
      } catch (error) {
        console.error(
          `Failed to notify subscriber ${subscriber.userId}:`,
          error,
        );
        // Continue with next subscriber
      }
    }
  }

  private formatSignalMessage(
    signal: Signal,
    subscription: { takeProfit: number | null },
  ): string {
    const baseMessage =
      `🔔 Новый сигнал!\n\n` +
      `Символ: ${signal.symbol}\n` +
      `Интервал: ${signal.interval}\n` +
      `Тип: ${signal.type === 'long' ? '🟢 Long' : '🔴 Short'}\n` +
      `Цена входа: ${signal.entryPrice}\n`;

    if (subscription.takeProfit) {
      return baseMessage + `Take Profit: ${subscription.takeProfit}%`;
    }

    return baseMessage;
  }

  async updateSignalStatus(
    symbol: string,
    status: Signal['status'],
    currentPrice: number,
    profitLoss: number,
  ): Promise<void> {
    const signal = await this.signalsDb.getSignalBySymbol(symbol);
    if (!signal) return;

    await this.signalsDb.updateSignalStatus(
      symbol,
      status,
      currentPrice,
      profitLoss,
    );

    if (status === 'success') {
      await this.telegramService.sendReplyNotification(
        'fix',
        `${symbol} 💰 Прибыль по сигналу! \n` +
          `Тип: ${signal.type}\n` +
          `Текущая цена: ${currentPrice}\n` +
          `Доходность: ${profitLoss.toFixed(2)}%`,
        signal.messageId,
      );
    }
  }

  async getActiveSignals(userId: string): Promise<Signal[]> {
    return this.signalsDb.getActiveSignals(userId);
  }

  async getSignalStats(userId: string): Promise<any[]> {
    return this.signalsDb.getSignalStats(userId);
  }

  async cleanupOldSignals(daysToKeep: number = 30): Promise<void> {
    await this.signalsDb.cleanupOldSignals(daysToKeep);
  }

  async checkSignalProfit({
    symbol,
    currentPrice,
    highPrice,
    lowPrice,
    profitConfig,
  }: {
    symbol: string;
    currentPrice: number;
    highPrice: number;
    lowPrice: number;
    profitConfig: { profit: number; validityHours: number };
  }): Promise<void> {
    const activeSignals = await this.getActiveSignals();
    const symbolSignals = activeSignals.filter(
      (signal) => signal.symbol === symbol && signal.status === 'active',
    );

    if (!symbolSignals.length) return;

    for (const signal of symbolSignals) {
      let profitPercent = 0;
      let maxPossibleProfitPercent = 0;

      if (signal.type === 'long') {
        profitPercent =
          ((currentPrice - signal.entryPrice) / signal.entryPrice) * 100;
        maxPossibleProfitPercent =
          ((highPrice - signal.entryPrice) / signal.entryPrice) * 100;
      } else if (signal.type === 'short') {
        profitPercent =
          ((signal.entryPrice - currentPrice) / signal.entryPrice) * 100;
        maxPossibleProfitPercent =
          ((signal.entryPrice - lowPrice) / signal.entryPrice) * 100;
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
