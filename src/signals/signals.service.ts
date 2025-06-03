import { Injectable } from '@nestjs/common';
import { SignalsDatabaseService } from './signals-database.service';
import { Signal } from './entities/signal.entity';
import { TelegramService } from '../telegram/telegram.service';
import { ConfigService } from '@nestjs/config';
import { SUPPORTED_INTERVALS } from 'src/trading-bot/utils/interval.utils';
import { dayjs } from '../utils';

@Injectable()
export class SignalsService {
  constructor(
    private readonly signalsDb: SignalsDatabaseService,
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
  ) {}

  async createSignal(signal: Signal, userId: string) {
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

    const message = this.formatSignalMessage(signal);
    const messageId = await this.telegramService.sendDirectMessage(
      userId,
      message,
    );
    signal.messageId = messageId;
    await this.signalsDb.saveSignal(signal);
  }

  private formatSignalMessage(signal: Signal): string {
    const channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID', '');
    let baseMessage =
      `🔵 *Новый торговый сигнал*\n` +
      `<b>${signal.symbol}</b> ${signal.type === 'long' ? '📈 Сигнал на открытие лонга' : '📉 Сигнал на открытие шорта'} \n`;
    if (channelId !== signal.userId) {
      baseMessage += `Интервал: <b>${signal.interval}m</b>\n`;
    }
    baseMessage +=
      `Цена: ${signal.entryPrice} \n` +
      `TP: ${SUPPORTED_INTERVALS[`${signal.interval}m`].profit}%`;

    return baseMessage;
  }

  async updateSignalStatus(
    signal: Signal,
    status: Signal['status'],
    currentPrice: number,
    profitPercent: number,
  ): Promise<void> {
    await this.signalsDb.updateSignalStatus(signal.id, status);

    if (status === 'success') {
      await this.telegramService.sendReplyNotification(
        'fix',
        `${signal.symbol} 💰 Прибыль по сигналу! \n` +
          `Тип: ${signal.type}\n` +
          `Текущая цена: ${currentPrice}\n` +
          `Доходность: ${profitPercent.toFixed(3)}%`,
        signal.messageId,
        signal.userId,
      );
    }
  }

  async getActiveSignals(userId?: string): Promise<Signal[]> {
    return this.signalsDb.getActiveSignals(userId);
  }

  async getActiveSignalsBySymbol(symbol: string): Promise<Signal[]> {
    return this.signalsDb.getActiveSignalsBySymbol(symbol);
  }

  async getSignalStats(userId: string) {
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
    const symbolSignals = await this.getActiveSignalsBySymbol(symbol);

    if (!symbolSignals.length) return;

    for (const signal of symbolSignals) {
      let maxPossibleProfitPercent = 0;

      if (signal.type === 'long') {
        maxPossibleProfitPercent =
          ((highPrice - signal.entryPrice) / signal.entryPrice) * 100;
      } else if (signal.type === 'short') {
        maxPossibleProfitPercent =
          ((signal.entryPrice - lowPrice) / signal.entryPrice) * 100;
      }
      const isExpired = dayjs(signal.createdAt)
        .add(profitConfig.validityHours, 'h')
        .isSameOrBefore(dayjs());
      if (maxPossibleProfitPercent >= profitConfig.profit) {
        await this.updateSignalStatus(
          signal,
          'success',
          currentPrice,
          maxPossibleProfitPercent,
        );
      } else if (isExpired) {
        await this.updateSignalStatus(
          signal,
          'failure',
          currentPrice,
          maxPossibleProfitPercent,
        );
      }
    }
  }
}
