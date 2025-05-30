import { Injectable } from '@nestjs/common';
import { SessionStore } from './session.store';
import { MessageHandler } from './message.handler';

export type ConversationState = 
  | 'idle'
  | 'awaiting_symbol'
  | 'awaiting_interval'
  | 'awaiting_unsubscribe'
  | 'awaiting_confirmation';

interface ConversationData {
  symbol?: string;
  interval?: string;
  action?: 'subscribe' | 'unsubscribe';
  [key: string]: any;
}

@Injectable()
export class ConversationService {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly messageHandler: MessageHandler,
  ) {}

  async startConversation(userId: string, action: 'subscribe' | 'unsubscribe'): Promise<void> {
    await this.sessionStore.setState(userId, 'awaiting_symbol');
    await this.sessionStore.setData(userId, { action });
    
    const message = action === 'subscribe' 
      ? 'Введите торговую пару, например: BTCUSDT'
      : 'Введите торговую пару для отписки, например: BTCUSDT';
    
    await this.messageHandler.sendDirectInfo(
      userId,
      action === 'subscribe' ? 'Подписка на сигналы' : 'Отписка от сигналов',
      message
    );
  }

  async handleSymbolInput(userId: string, symbol: string): Promise<void> {
    const data = await this.sessionStore.getData(userId);
    if (!data?.action) {
      await this.messageHandler.sendDirectError(
        userId,
        new Error('Неизвестное действие. Начните заново с команды /subscribe или /unsubscribe'),
        'Ошибка состояния'
      );
      await this.sessionStore.clearState(userId);
      return;
    }

    const formattedSymbol = symbol.toUpperCase().trim();
    
    // Validate symbol format
    if (!this.isValidSymbol(formattedSymbol)) {
      await this.messageHandler.sendDirectError(
        userId,
        new Error('Неверный формат символа. Используйте формат BTCUSDT, ETHUSDT и т.д.'),
        'Ошибка ввода'
      );
      return;
    }

    await this.sessionStore.setData(userId, { ...data, symbol: formattedSymbol });
    await this.sessionStore.setState(userId, 'awaiting_interval');
    
    const message = data.action === 'subscribe'
      ? 'Введите интервал, например: 1h, 4h, 1d'
      : 'Введите интервал для отписки, например: 1h, 4h, 1d';
    
    await this.messageHandler.sendDirectInfo(
      userId,
      data.action === 'subscribe' ? 'Подписка на сигналы' : 'Отписка от сигналов',
      message
    );
  }

  async handleIntervalInput(userId: string, interval: string): Promise<void> {
    const data = await this.sessionStore.getData(userId);
    if (!data?.action || !data?.symbol) {
      await this.messageHandler.sendDirectError(
        userId,
        new Error('Не удалось найти данные о символе. Начните заново'),
        'Ошибка данных'
      );
      await this.sessionStore.clearState(userId);
      return;
    }

    const formattedInterval = interval.toLowerCase().trim();
    
    // Validate interval format
    if (!this.isValidInterval(formattedInterval)) {
      await this.messageHandler.sendDirectError(
        userId,
        new Error('Неверный формат интервала. Используйте формат 1m, 5m, 15m, 1h, 4h, 1d'),
        'Ошибка ввода'
      );
      return;
    }

    await this.sessionStore.setData(userId, { ...data, interval: formattedInterval });
    await this.sessionStore.setState(userId, 'awaiting_confirmation');
    
    const message = data.action === 'subscribe'
      ? `Подтвердите подписку на ${data.symbol} (${formattedInterval})\nОтправьте "да" для подтверждения или "нет" для отмены`
      : `Подтвердите отписку от ${data.symbol} (${formattedInterval})\nОтправьте "да" для подтверждения или "нет" для отмены`;
    
    await this.messageHandler.sendDirectInfo(
      userId,
      data.action === 'subscribe' ? 'Подтверждение подписки' : 'Подтверждение отписки',
      message
    );
  }

  async handleConfirmation(userId: string, confirmation: string): Promise<{ action: 'subscribe' | 'unsubscribe'; symbol: string; interval: string; } | void> {
    const data = await this.sessionStore.getData(userId);
    if (!data?.action || !data?.symbol || !data?.interval) {
      await this.messageHandler.sendDirectError(
        userId,
        new Error('Не удалось найти данные о подписке. Начните заново'),
        'Ошибка данных'
      );
      await this.sessionStore.clearState(userId);
      return;
    }

    const isConfirmed = confirmation.toLowerCase().trim() === 'да';
    if (!isConfirmed) {
      await this.messageHandler.sendDirectInfo(
        userId,
        'Отмена операции',
        'Операция отменена. Используйте команды /subscribe или /unsubscribe для начала новой операции'
      );
      await this.sessionStore.clearState(userId);
      return;
    }

    // Return the data for the subscription service to handle
    return {
      action: data.action,
      symbol: data.symbol,
      interval: data.interval
    };
  }

  private isValidSymbol(symbol: string): boolean {
    const symbolRegex = /^[A-Z0-9]{2,20}$/;
    return symbolRegex.test(symbol);
  }

  private isValidInterval(interval: string): boolean {
    const validIntervals = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];
    return validIntervals.includes(interval);
  }
} 