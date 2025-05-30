import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Subscription } from '../entities/subscription.entity';

@Injectable()
export class SubscriptionsRepository {
  constructor(
    @InjectRepository(Subscription)
    private readonly repository: Repository<Subscription>,
  ) {}

  async findOne(userId: string, symbol: string, interval: string): Promise<Subscription | null> {
    return this.repository.findOne({
      where: { userId, symbol, interval },
    });
  }

  async save(subscription: Subscription): Promise<Subscription> {
    return this.repository.save(subscription);
  }

  async findActiveBySymbolAndInterval(symbol: string, interval: string): Promise<Subscription[]> {
    return this.repository.find({
      where: { symbol, interval, active: true },
    });
  }

  async find(where: FindOptionsWhere<Subscription>): Promise<Subscription[]> {
    return this.repository.find({ where });
  }
} 