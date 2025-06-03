import dotenv from 'dotenv';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TradingBotModule } from './trading-bot/trading-bot.module';
import { TelegramModule } from './telegram/telegram.module';
import { BybitModule } from './bybit/bybit.module';
import { SignalsModule } from './signals/signals.module';
import { SubscriptionsModule } from './trading-bot/subscriptions/subscriptions.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Signal } from './signals/entities/signal.entity';
import { Subscription } from './trading-bot/entities/subscription.entity';

dotenv.config();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Signal, Subscription],
      ssl: {
        rejectUnauthorized: false,
      },
      autoLoadEntities: true,
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    TradingBotModule,
    TelegramModule,
    BybitModule,
    SignalsModule,
    SubscriptionsModule,
  ],
})
export class AppModule {}
