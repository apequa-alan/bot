import { Injectable } from '@nestjs/common';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { SessionStore } from '../services/session.store';
import { MessageHandler } from '../services/message.handler';
import { ConversationService } from '../services/conversation.service';

type SubscriptionState =
  | 'awaiting_symbol'
  | 'awaiting_interval'
  | 'awaiting_unsubscribe';

@Injectable()
export class SubscriptionCommands {
  private readonly availablePairs: readonly string[] = [
    'BTCUSDT',
    'ETHUSDT',
    'BNBUSDT',
    'ADAUSDT',
    'DOGEUSDT',
    'XRPUSDT',
    'DOTUSDT',
    'UNIUSDT',
    'LTCUSDT',
    'LINKUSDT',
    'SOLUSDT',
    'MATICUSDT',
    'AVAXUSDT',
    'ATOMUSDT',
    'TRXUSDT',
  ] as const;

  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly sessionStore: SessionStore,
    private readonly messageHandler: MessageHandler,
    private readonly conversationService: ConversationService,
  ) {}

  async handleSubscribeCommand(userId: string): Promise<void> {
    await this.conversationService.startConversation(userId, 'subscribe');
  }

  async handleSubscriptionsCommand(userId: string): Promise<void> {
    const subscriptions = await this.subscriptionsService.findByUser(userId);
    if (subscriptions.length === 0) {
      await this.messageHandler.sendDirectInfo(
        userId,
        'Ваши подписки',
        'У вас пока нет активных подписок',
      );
      return;
    }

    const subscriptionsList = subscriptions
      .map((sub) => `${sub.symbol} (${sub.interval})`)
      .join('\n');

    await this.messageHandler.sendDirectInfo(
      userId,
      'Ваши подписки',
      subscriptionsList,
    );
  }

  async handleUnsubscribeCommand(userId: string): Promise<void> {
    const subscriptions = await this.subscriptionsService.findByUser(userId);
    if (subscriptions.length === 0) {
      await this.messageHandler.sendDirectInfo(
        userId,
        'Отписка от сигналов',
        'У вас нет активных подписок',
      );
      return;
    }

    await this.conversationService.startConversation(userId, 'unsubscribe');
  }

  async handleMessage(userId: string, text: string): Promise<void> {
    const state = await this.sessionStore.getState(userId);
    if (!state) return;

    try {
      switch (state) {
        case 'awaiting_symbol':
          await this.conversationService.handleSymbolInput(userId, text);
          break;
        case 'awaiting_interval':
          await this.conversationService.handleIntervalInput(userId, text);
          break;
        case 'awaiting_confirmation':
          const result = await this.conversationService.handleConfirmation(
            userId,
            text,
          );
          if (result) {
            if (result.action === 'subscribe') {
              await this.handleSubscribeConfirmation(userId, result);
            } else {
              await this.handleUnsubscribeConfirmation(userId, result);
            }
          }
          break;
        default:
          await this.messageHandler.sendDirectError(
            userId,
            new Error(
              'Неизвестное состояние сессии. Начните заново с команды /subscribe',
            ),
            'Ошибка состояния',
          );
          await this.sessionStore.clearState(userId);
      }
    } catch (error) {
      await this.messageHandler.sendDirectError(userId, error);
      await this.sessionStore.clearState(userId);

      await this.messageHandler.sendDirectInfo(
        userId,
        'Начать заново',
        'Используйте команду /subscribe для начала процесса подписки',
      );
    }
  }

  private async handleSubscribeConfirmation(
    userId: string,
    data: { symbol: string; interval: string },
  ): Promise<void> {
    // Check for existing subscription
    const existingSubscriptions =
      await this.subscriptionsService.findByUser(userId);
    const isDuplicate = existingSubscriptions.some(
      (sub) => sub.symbol === data.symbol && sub.interval === data.interval,
    );

    if (isDuplicate) {
      await this.messageHandler.sendDirectError(
        userId,
        new Error(
          `У вас уже есть подписка на ${data.symbol} (${data.interval})`,
        ),
        'Дублирование подписки',
      );
      await this.sessionStore.clearState(userId);
      return;
    }

    await this.subscriptionsService.create(userId, {
      symbol: data.symbol,
      interval: data.interval,
      takeProfit: 1.0, // Default take profit
    });

    await this.sessionStore.clearState(userId);
    await this.messageHandler.sendDirectInfo(
      userId,
      'Подписка на сигналы',
      `Вы успешно подписались на сигналы ${data.symbol} (${data.interval})`,
    );
  }

  private async handleUnsubscribeConfirmation(
    userId: string,
    data: { symbol: string; interval: string },
  ): Promise<void> {
    const subscriptions = await this.subscriptionsService.findByUser(userId);
    const subscription = subscriptions.find(
      (sub) => sub.symbol === data.symbol && sub.interval === data.interval,
    );

    if (!subscription) {
      await this.messageHandler.sendDirectError(
        userId,
        new Error(`Подписка на ${data.symbol} (${data.interval}) не найдена`),
        'Ошибка отписки',
      );
      await this.sessionStore.clearState(userId);
      return;
    }

    await this.subscriptionsService.delete(subscription.id, userId);
    await this.sessionStore.clearState(userId);
    await this.messageHandler.sendDirectInfo(
      userId,
      'Отписка от сигналов',
      `Вы успешно отписались от сигналов ${data.symbol} (${data.interval})`,
    );
  }

  /**
   * Handles the /pairs command to display available trading pairs
   * @param userId - The ID of the user requesting the pairs list
   */
  async handlePairsCommand(userId: string): Promise<void> {
    const pairsList = this.availablePairs.join('\n');
    await this.messageHandler.sendDirectInfo(
      userId,
      'Доступные торговые пары',
      pairsList,
    );
  }
}
