import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionEntity } from './entities/subscription.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionsRepository: Repository<SubscriptionEntity>,
  ) {}

  async create(
    userId: string,
    dto: CreateSubscriptionDto,
  ): Promise<SubscriptionEntity> {
    const subscription = this.subscriptionsRepository.create({
      userId,
      ...dto,
    });
    return this.subscriptionsRepository.save(subscription);
  }

  async findByUser(userId: string): Promise<SubscriptionEntity[]> {
    return this.subscriptionsRepository.find({
      where: { userId },
      order: { id: 'DESC' },
    });
  }

  async findBySymbol(symbol: string): Promise<SubscriptionEntity[]> {
    return this.subscriptionsRepository.find({
      where: { symbol },
    });
  }

  async delete(id: number, userId: string): Promise<boolean> {
    const result = await this.subscriptionsRepository.delete({ id, userId });

    if (result.affected === 0) {
      throw new NotFoundException(
        `Subscription with ID ${id} not found for user ${userId}`,
      );
    }

    return true;
  }

  async findMatching(
    symbol: string,
    interval: string,
  ): Promise<SubscriptionEntity[]> {
    return this.subscriptionsRepository.find({
      where: {
        symbol: symbol.toUpperCase(),
        interval: interval.toLowerCase(),
      },
      order: { id: 'DESC' },
    });
  }
}
