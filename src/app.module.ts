import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TradingBotModule } from './trading-bot/trading-bot.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // глобальная конфигурация
    ScheduleModule.forRoot(),
    TradingBotModule,
    TelegramModule,
  ],
})
export class AppModule {}
