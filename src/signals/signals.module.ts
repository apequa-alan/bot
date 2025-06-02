import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignalsService } from './signals.service';
import { SignalsDatabaseService } from './signals-database.service';
import { Signal } from './entities/signal.entity';
import { TelegramModule } from '../telegram/telegram.module';
import { SubscriptionsModule } from '../trading-bot/subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Signal]),
    TelegramModule,
    SubscriptionsModule,
  ],
  providers: [SignalsService, SignalsDatabaseService],
  exports: [SignalsService],
})
export class SignalsModule {} 