import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { TelegramService } from './telegram.service';
import { SubscriptionCommands } from './commands/subscription.commands';
import { SignalUpdateService } from './services/signal-update.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule,
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService) => ({
        token: configService.get('TELEGRAM_BOT_TOKEN'),
      }),
      inject: [ConfigService],
    }),
    SubscriptionsModule,
  ],
  providers: [
    TelegramService,
    SubscriptionCommands,
    SignalUpdateService,
  ],
  exports: [TelegramService, SignalUpdateService],
})
export class TelegramModule {}
