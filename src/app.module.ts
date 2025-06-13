import { Module } from '@nestjs/common';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { TradingBotModule } from './trading-bot/trading-bot.module';
import { TelegramModule } from './telegram/telegram.module';
import { BybitModule } from './bybit/bybit.module';
import { SignalsModule } from './signals/signals.module';
import { SubscriptionsModule } from './trading-bot/subscriptions/subscriptions.module';
import { Signal } from './signals/entities/signal.entity';
import { Subscription } from './trading-bot/entities/subscription.entity';
import { configuration } from './config/configuration';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
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
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
