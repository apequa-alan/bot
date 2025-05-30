import { Injectable } from '@nestjs/common';
import { TelegramService } from '../telegram.service';
import { Signal } from '../../signals/entities/signal.entity';
import {
  formatNumberForMarkdown,
  formatPercentageForMarkdown,
  formatSymbolForMarkdown,
} from '../telegram.utils';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { MessageHandler } from './message.handler';

@Injectable()
export class SignalBroadcastService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly messageHandler: MessageHandler,
  ) {}

  async broadcastToChannel(signal: Signal): Promise<number> {
    const signalType = signal.type === 'long' ? '📈 Сигнал на открытие лонга' : '📉 Сигнал на открытие шорта';
    const formattedSymbol = formatSymbolForMarkdown(signal.symbol);
    const formattedPrice = formatNumberForMarkdown(signal.entryPrice);
    const formattedTP = formatPercentageForMarkdown(signal.takeProfit ?? 0);

    const signalContent = `${formattedSymbol} ${signalType}\n` +
      `Цена: ${formattedPrice}\n` +
      `TP: ${formattedTP}\n`;

    return this.telegramService.sendInfoNotification(
      'Новый торговый сигнал',
      signalContent
    );
  }

  async broadcastToUser(userId: string, signal: Signal): Promise<void> {
    const signalType = signal.type === 'long' ? '📈 Сигнал на открытие лонга' : '📉 Сигнал на открытие шорта';
    const formattedSymbol = formatSymbolForMarkdown(signal.symbol);
    const formattedPrice = formatNumberForMarkdown(signal.entryPrice);
    const formattedTP = formatPercentageForMarkdown(signal.takeProfit ?? 0);

    const signalContent = `${formattedSymbol} ${signalType}\n` +
      `Цена: ${formattedPrice}\n` +
      `TP: ${formattedTP}\n`;

    await this.telegramService.sendDirectInfo(
      userId,
      'Новый торговый сигнал',
      signalContent
    );
  }

  async broadcastUpdateToChannel(
    signal: Signal,
    currentPrice: number,
    profitLoss: number,
  ): Promise<number> {
    const formattedSymbol = formatSymbolForMarkdown(signal.symbol);
    const formattedPrice = formatNumberForMarkdown(currentPrice);
    const formattedProfit = formatPercentageForMarkdown(profitLoss);

    return this.telegramService.sendReplyNotification(
      'fix',
      `${formattedSymbol} 💰 Прибыль по сигналу!\n` +
      `Тип: ${signal.type}\n` +
      `Текущая цена: ${formattedPrice}\n` +
      `Доходность: ${formattedProfit}`,
      signal.messageId,
    );
  }

  async broadcastUpdateToUser(
    userId: string,
    signal: Signal,
    currentPrice: number,
    profitLoss: number,
  ): Promise<void> {
    const formattedSymbol = formatSymbolForMarkdown(signal.symbol);
    const formattedPrice = formatNumberForMarkdown(currentPrice);
    const formattedProfit = formatPercentageForMarkdown(profitLoss);

    await this.telegramService.sendDirectInfo(
      userId,
      'Обновление сигнала',
      `${formattedSymbol} 💰 Прибыль по сигналу!\n` +
      `Тип: ${signal.type}\n` +
      `Текущая цена: ${formattedPrice}\n` +
      `Доходность: ${formattedProfit}`
    );
  }

  /**
   * Broadcasts a signal to all users subscribed to the specific symbol and interval
   * @param signal The signal to broadcast
   */
  async broadcastSignal(signal: Signal): Promise<void> {
    try {
      // Find all users subscribed to this symbol and interval
      const subscriptions = await this.subscriptionsService.findMatching(
        signal.symbol,
        signal.interval
      );

      if (subscriptions.length === 0) {
        console.log(`No subscribers found for ${signal.symbol} (${signal.interval})`);
        return;
      }

      // Send the signal to each subscriber with their custom take profit
      for (const subscription of subscriptions) {
        try {
          const message = this.formatSignalMessage(signal, subscription.takeProfit);
          await this.messageHandler.sendDirectInfo(
            subscription.userId,
            'Новый сигнал',
            message
          );
        } catch (error) {
          console.error(`Failed to send signal to user ${subscription.userId}:`, error);
          // Continue with other users even if one fails
        }
      }

      console.log(`Signal broadcasted to ${subscriptions.length} users for ${signal.symbol} (${signal.interval})`);
    } catch (error) {
      console.error('Error broadcasting signal:', error);
      throw error;
    }
  }

  /**
   * Formats a signal into a readable message
   * @param signal The signal to format
   * @param takeProfitPercentage The take profit percentage from the subscription
   * @returns Formatted message string
   */
  private formatSignalMessage(signal: Signal, takeProfitPercentage: number): string {
    const direction = signal.type === 'long' ? '🟢 LONG' : '🔴 SHORT';
    const entryPrice = signal.entryPrice.toFixed(2);
    const takeProfitPrice = signal.type === 'long' 
      ? (signal.entryPrice * (1 + takeProfitPercentage / 100)).toFixed(2)
      : (signal.entryPrice * (1 - takeProfitPercentage / 100)).toFixed(2);
    const stopLoss = signal.stopLoss?.toFixed(2) ?? 'Не указан';

    return [
      `${direction} ${signal.symbol}`,
      `Интервал: ${signal.interval}`,
      `Вход: ${entryPrice}`,
      `Take Profit: ${takeProfitPrice} (${takeProfitPercentage}%)`,
      `Stop Loss: ${stopLoss}`,
      signal.validityHours ? `Срок действия: ${signal.validityHours} часов` : ''
    ].join('\n');
  }
} 