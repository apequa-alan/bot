import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TradingBotService } from './trading-bot.service';
import { BybitModule } from '../bybit/bybit.module';
import { TelegramModule } from '../telegram/telegram.module';
import { SignalsModule } from '../signals/signals.module';
import { SignalGeneratorService } from './signal-generator.service';

@Module({
  imports: [ConfigModule, BybitModule, TelegramModule, SignalsModule],
  providers: [TradingBotService, SignalGeneratorService],
  exports: [TradingBotService, SignalGeneratorService],
})
export class TradingBotModule {}
