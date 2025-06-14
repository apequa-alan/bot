import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { TradingBotModule } from '../trading-bot.module';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription]),
    forwardRef(() => TradingBotModule),
    UsersModule,
  ],
  providers: [SubscriptionsService, SubscriptionsRepository],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
