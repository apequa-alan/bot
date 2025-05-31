import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TradingBotService } from './trading-bot.service';
import { BybitModule } from '../bybit/bybit.module';
import { TelegramModule } from '../telegram/telegram.module';
import { SignalsModule } from '../signals/signals.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule,
    BybitModule,
    TelegramModule,
    SignalsModule,
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [TradingBotService],
  exports: [TradingBotService],
})
export class TradingBotModule {}
