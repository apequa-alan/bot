import { Injectable } from '@nestjs/common';
import { MessageHandler } from './message.handler';
import { Signal } from '../../signals/entities/signal.entity';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';

@Injectable()
export class SignalUpdateService {
  constructor(
    private readonly messageHandler: MessageHandler,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Broadcasts a signal update to all users subscribed to the specific symbol and interval
   * @param signal The signal that was updated
   * @param currentPrice The current price of the asset
   * @param profitLoss The profit/loss percentage
   */
  async broadcastUpdate(
    signal: Signal,
    currentPrice: number,
    profitLoss: number,
  ): Promise<void> {
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

      // Format the update message
      const message = this.formatUpdateMessage(signal, currentPrice, profitLoss);

      // Send the update to each subscriber
      for (const subscription of subscriptions) {
        try {
          await this.messageHandler.sendDirectInfo(
            subscription.userId,
            'Обновление сигнала',
            message
          );
        } catch (error) {
          console.error(`Failed to send update to user ${subscription.userId}:`, error);
          // Continue with other users even if one fails
        }
      }

      console.log(`Update broadcasted to ${subscriptions.length} users for ${signal.symbol} (${signal.interval})`);
    } catch (error) {
      console.error('Error broadcasting update:', error);
      throw error;
    }
  }

  /**
   * Formats a signal update into a readable message
   * @param signal The signal that was updated
   * @param currentPrice The current price of the asset
   * @param profitLoss The profit/loss percentage
   * @returns Formatted message string
   */
  private formatUpdateMessage(
    signal: Signal,
    currentPrice: number,
    profitLoss: number,
  ): string {
    const direction = signal.type === 'long' ? '🟢 LONG' : '🔴 SHORT';
    const status = signal.status === 'success' ? '✅ Успешно' : '❌ Закрыт';
    const entryPrice = signal.entryPrice.toFixed(2);
    const currentPriceFormatted = currentPrice.toFixed(2);
    const profitLossFormatted = profitLoss.toFixed(2);

    return [
      `${direction} ${signal.symbol}`,
      `Статус: ${status}`,
      `Интервал: ${signal.interval}`,
      `Вход: ${entryPrice}`,
      `Текущая цена: ${currentPriceFormatted}`,
      `Прибыль/Убыток: ${profitLossFormatted}%`,
      signal.exitPrice ? `Цена выхода: ${signal.exitPrice.toFixed(2)}` : ''
    ].join('\n');
  }
} 