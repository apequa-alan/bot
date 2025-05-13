import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TradingBotModule } from './trading-bot/trading-bot.module';
import { TelegramModule } from './telegram/telegram.module';
import { BybitModule } from './bybit/bybit.module';
import { SignalsModule } from './signals/signals.module';
import { Signal } from './signals/entities/signal.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // глобальная конфигурация
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'signals.db',
      entities: [Signal],
      synchronize: false,
    }),
    ScheduleModule.forRoot(),
    TradingBotModule,
    TelegramModule,
    BybitModule,
    SignalsModule,
  ],
})
export class AppModule {}
