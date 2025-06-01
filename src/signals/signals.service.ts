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

  async createSignal(signal: Signal, userId: string): Promise<number> {
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
      return 0;
    }

    await this.signalsDb.saveSignal(signal);

    // Get all subscribers for this symbol-interval pair
    const subscribers = await this.subscriptionsService.getSubscribersForPair(
      signal.symbol,
      signal.interval,
    );

    let messageId = 0;
    // Send notification to each subscriber
    for (const subscriberId of subscribers) {
      try {
        const message = this.formatSignalMessage(signal, {
          takeProfit: signal.takeProfit,
        });
        messageId = await this.telegramService.sendDirectMessage(
          subscriberId,
          message,
        );
      } catch (error) {
        console.error(
          `Failed to send signal notification to ${subscriberId}:`,
          error,
        );
        // Continue with next subscriber
      }
    }
    return messageId;
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
        signal.userId,
      );
    }
  }

  async getActiveSignals(userId?: string): Promise<Signal[]> {
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
    const activeSignals = await this.getActiveSignals(symbol);
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

  async updateSignal(signal: Signal): Promise<void> {
    await this.signalsDb.updateSignal(signal);
  }
}
