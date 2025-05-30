import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { TelegramService } from './telegram.service';
import { SubscriptionCommands } from './commands/subscription.commands';
import { SignalUpdateService } from './services/signal-update.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BybitModule } from '../bybit/bybit.module';
import { SessionStore } from './services/session.store';
import { MessageHandler } from './services/message.handler';
import { ConversationService } from './services/conversation.service';
import { TelegrafModuleOptions } from 'nestjs-telegraf';

@Module({
  imports: [
    ConfigModule,
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): TelegrafModuleOptions => {
        const token = configService.get<string>('TELEGRAM_BOT_TOKEN');
        if (!token) {
          throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment variables');
        }
        return { token };
      },
      inject: [ConfigService],
    }),
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => BybitModule),
  ],
  providers: [
    TelegramService,
    SubscriptionCommands,
    SignalUpdateService,
    SessionStore,
    MessageHandler,
    ConversationService,
  ],
  exports: [TelegramService, SignalUpdateService],
})
export class TelegramModule {}
