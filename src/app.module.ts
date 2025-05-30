import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TradingBotModule } from './trading-bot/trading-bot.module';
import { TelegramModule } from './telegram/telegram.module';
import { BybitModule } from './bybit/bybit.module';
import { SignalsModule } from './signals/signals.module';
import { Signal } from './signals/entities/signal.entity';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SubscriptionEntity } from './subscriptions/entities/subscription.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // глобальная конфигурация
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'signals.db',
      entities: [Signal, SubscriptionEntity],
      synchronize: false,
      migrations: ['src/migrations/*.ts'],
      migrationsRun: true,
    }),
    ScheduleModule.forRoot(),
    TradingBotModule,
    TelegramModule,
    BybitModule,
    SignalsModule,
    SubscriptionsModule,
  ],
})
export class AppModule {}
