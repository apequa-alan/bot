import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionsRepository } from './subscriptions.repository';
import { TradingBotService } from '../trading-bot.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly repository: SubscriptionsRepository,
    @Inject(forwardRef(() => TradingBotService))
    private readonly tradingBotService: TradingBotService,
  ) {}

  async createOrUpdateSubscription(
    userId: string,
    symbol: string,
    interval: string,
    takeProfit?: number,
  ): Promise<Subscription> {
    const existingSubscription = await this.repository.findOne(
      userId,
      symbol,
      interval,
    );

    if (existingSubscription) {
      existingSubscription.active = true;
      if (takeProfit !== undefined) {
        existingSubscription.takeProfit = takeProfit;
      }
      const updated = await this.repository.save(existingSubscription);
      await this.tradingBotService.handleSubscriptionChange();
      return updated;
    }

    const newSubscription = new Subscription();
    newSubscription.userId = userId;
    newSubscription.symbol = symbol;
    newSubscription.interval = interval;
    newSubscription.takeProfit = takeProfit ?? null;
    newSubscription.active = true;

    const created = await this.repository.save(newSubscription);
    await this.tradingBotService.handleSubscriptionChange();
    return created;
  }

  async deactivateSubscription(
    userId: string,
    symbol: string,
    interval: string,
  ): Promise<Subscription | null> {
    const subscription = await this.repository.findOne(
      userId,
      symbol,
      interval,
    );
    if (!subscription) {
      return null;
    }

    subscription.active = false;
    const updated = await this.repository.save(subscription);
    await this.tradingBotService.handleSubscriptionChange();
    return updated;
  }

  async getSubscribersForSignal(
    symbol: string,
    interval: string,
  ): Promise<Subscription[]> {
    return this.repository.findActiveBySymbolAndInterval(symbol, interval);
  }

  async getUserSubscriptions(userId: string): Promise<Subscription[]> {
    return this.repository.find({
      userId,
      active: true,
    });
  }

  async getActiveSubscribersForSymbolInterval(
    symbol: string,
    interval: string,
  ): Promise<Subscription[]> {
    return this.repository.find({
      symbol,
      interval,
      active: true,
    });
  }

  async getAllActiveSubscriptions(): Promise<Subscription[]> {
    return this.repository.find({
      active: true,
    });
  }

  async deactivateAllUserSubscriptions(userId: string): Promise<void> {
    const subscriptions = await this.repository.find({
      userId,
      active: true,
    });

    for (const subscription of subscriptions) {
      subscription.active = false;
      await this.repository.save(subscription);
    }

    await this.tradingBotService.handleSubscriptionChange();
  }

  async getSubscribersForPair(symbol: string, interval: string): Promise<string[]> {
    const subscriptions = await this.repository.find({
      symbol,
      interval,
      active: true,
    });

    return subscriptions.map(sub => sub.userId);
  }
}
