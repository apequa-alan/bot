import { Injectable } from '@nestjs/common';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionsRepository } from './subscriptions.repository';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly repository: SubscriptionsRepository) {}

  async createOrUpdateSubscription(
    userId: string,
    symbol: string,
    interval: string,
    takeProfit?: number,
  ): Promise<Subscription> {
    const existingSubscription = await this.repository.findOne(userId, symbol, interval);

    if (existingSubscription) {
      existingSubscription.active = true;
      if (takeProfit !== undefined) {
        existingSubscription.takeProfit = takeProfit;
      }
      return this.repository.save(existingSubscription);
    }

    const newSubscription = new Subscription();
    newSubscription.userId = userId;
    newSubscription.symbol = symbol;
    newSubscription.interval = interval;
    newSubscription.takeProfit = takeProfit ?? null;
    newSubscription.active = true;

    return this.repository.save(newSubscription);
  }

  async deactivateSubscription(
    userId: string,
    symbol: string,
    interval: string,
  ): Promise<Subscription | null> {
    const subscription = await this.repository.findOne(userId, symbol, interval);
    if (!subscription) {
      return null;
    }

    subscription.active = false;
    return this.repository.save(subscription);
  }

  async getSubscribersForSignal(symbol: string, interval: string): Promise<Subscription[]> {
    return this.repository.findActiveBySymbolAndInterval(symbol, interval);
  }

  async getUserSubscriptions(userId: string): Promise<Subscription[]> {
    return this.repository.find({ userId, active: true });
  }
} 