import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TradingBotService } from './trading-bot.service';
import { BybitModule } from '../bybit/bybit.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [ConfigModule, BybitModule, TelegramModule],
  providers: [TradingBotService],
  exports: [TradingBotService],
})
export class TradingBotModule {}
