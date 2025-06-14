import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { TelegramService } from './telegram.service';
import { SubscriptionsModule } from '../trading-bot/subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ConfigModule,
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN', ''),
      }),
      inject: [ConfigService],
    }),
    SubscriptionsModule,
    UsersModule,
  ],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
