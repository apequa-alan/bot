import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TradingBotModule } from './trading-bot/trading-bot.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // глобальная конфигурация
    TradingBotModule,
  ],
})
export class AppModule {}
