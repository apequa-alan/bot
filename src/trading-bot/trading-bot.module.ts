import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TradingBotService } from './trading-bot.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [ConfigModule, TelegramModule],
  providers: [TradingBotService],
})
export class TradingBotModule {}
