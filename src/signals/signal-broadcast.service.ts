import { Injectable } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';
import { SubscriptionsService } from '../trading-bot/subscriptions/subscriptions.service';
import { Signal } from './entities/signal.entity';
import { getIntervalConfig } from '../trading-bot/utils/interval.utils';

@Injectable()
export class SignalBroadcastService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async broadcastSignal(signal: Signal): Promise<void> {
    try {
      // Get all active subscribers for this symbol and interval
      const subscribers =
        await this.subscriptionsService.getActiveSubscribersForSymbolInterval(
          signal.symbol,
          signal.interval,
        );

      if (subscribers.length === 0) {
        console.log(
          `No active subscribers found for ${signal.symbol} ${signal.interval}`,
        );
        return;
      }

      // Get default profit for this interval
      const { profit: defaultProfit } = getIntervalConfig(signal.interval);

      // Send signal to each subscriber with their personal take profit
      for (const subscriber of subscribers) {
        const takeProfit = subscriber.takeProfit ?? defaultProfit;
        const message = this.formatSignalMessage(signal, takeProfit);

        await this.telegramService.sendDirectMessage(
          subscriber.userId,
          message,
        );
      }

      console.log(`Signal broadcasted to ${subscribers.length} subscribers`);
    } catch (error) {
      console.error('Error broadcasting signal:', error);
      throw error;
    }
  }

  private formatSignalMessage(signal: Signal, takeProfit: number): string {
    const direction = signal.type === 'long' ? '🟢 LONG' : '🔴 SHORT';
    const takeProfitPrice = this.calculateTakeProfit(
      signal.entryPrice,
      takeProfit,
      signal.type,
    );
    const validityText = signal.validityHours
      ? `\nСрок действия: ${signal.validityHours} ч.`
      : '';

    return (
      `🚨 *Новый сигнал*\n\n` +
      `*${direction}* ${signal.symbol}\n` +
      `Интервал: ${signal.interval}\n` +
      `Вход: ${signal.entryPrice}\n` +
      `Take Profit: ${takeProfit}% (${takeProfitPrice})${validityText}\n\n` +
      `⚠️ Риск-менеджмент обязателен!`
    );
  }

  private calculateTakeProfit(
    entryPrice: number,
    profitPercent: number,
    type: 'long' | 'short',
  ): number {
    const multiplier =
      type === 'long' ? 1 + profitPercent / 100 : 1 - profitPercent / 100;
    return Number((entryPrice * multiplier).toFixed(8));
  }
}
