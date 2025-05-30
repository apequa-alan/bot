import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionEntity } from './entities/subscription.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UserSignalStreamManagerService } from './user-signal-stream-manager.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionsRepository: Repository<SubscriptionEntity>,
    private readonly userSignalStreamManager: UserSignalStreamManagerService,
  ) {}

  async create(
    userId: string,
    dto: CreateSubscriptionDto,
  ): Promise<SubscriptionEntity> {
    const subscription = this.subscriptionsRepository.create({
      userId,
      ...dto,
    });

    const savedSubscription = await this.subscriptionsRepository.save(subscription);

    // Subscribe to the symbol stream
    await this.userSignalStreamManager.subscribeToSymbolStream(
      dto.symbol,
      dto.interval,
    );

    return savedSubscription;
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
    const subscription = await this.subscriptionsRepository.findOne({
      where: { id, userId },
    });

    if (!subscription) {
      throw new NotFoundException(
        `Subscription with ID ${id} not found for user ${userId}`,
      );
    }

    // Unsubscribe from the symbol stream
    await this.userSignalStreamManager.unsubscribeFromSymbolStream(
      subscription.symbol,
      subscription.interval,
    );

    const result = await this.subscriptionsRepository.delete({ id, userId });
    return result?.affected ? result.affected > 0 : false;
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
