import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionEntity } from './entities/subscription.entity';
import { SubscriptionsService } from './subscriptions.service';
import { UserSignalStreamManagerService } from './user-signal-stream-manager.service';
import { BybitModule } from '../bybit/bybit.module';
import { TradingBotModule } from '../trading-bot/trading-bot.module';
import { SignalsModule } from '../signals/signals.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubscriptionEntity]),
    forwardRef(() => BybitModule),
    forwardRef(() => TradingBotModule),
    forwardRef(() => SignalsModule),
  ],
  providers: [SubscriptionsService, UserSignalStreamManagerService],
  exports: [SubscriptionsService, UserSignalStreamManagerService],
})
export class SubscriptionsModule {}
