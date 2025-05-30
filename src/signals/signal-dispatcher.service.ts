import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Signal } from './entities/signal.entity';
import { TelegramService } from '../telegram/telegram.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SignalFormatterService } from './signal-formatter.service';

@Injectable()
export class SignalDispatcherService {
  constructor(
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    private readonly signalFormatterService: SignalFormatterService,
  ) {}

  /**
   * Dispatches a signal to the main channel
   * @param signal The signal to dispatch
   * @returns The message ID of the sent message
   */
  public async dispatchToChannel(signal: Signal): Promise<number> {
    const message = this.signalFormatterService.formatSignalMessage(signal);
    return this.telegramService.sendNotification('info', message);
  }

  /**
   * Dispatches a signal to all matching subscribers
   * @param signal The signal to dispatch
   */
  public async dispatchToSubscribers(signal: Signal): Promise<void> {
    const matchingSubscribers = await this.subscriptionsService.findMatching(
      signal.symbol,
      signal.interval
    );
    const message = this.signalFormatterService.formatSignalMessage(signal);

    await Promise.all(
      matchingSubscribers.map(subscriber =>
        this.telegramService.sendDirectMessage(subscriber.userId, message)
      )
    );
  }
} 