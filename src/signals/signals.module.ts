import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignalsService } from './signals.service';
import { SignalsDatabaseService } from './signals-database.service';
import { TelegramService } from '../telegram/telegram.service';
import { Signal } from './entities/signal.entity';
import { SubscriptionsModule } from '../trading-bot/subscriptions/subscriptions.module';
import { SignalBroadcastService } from './signal-broadcast.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Signal]),
    SubscriptionsModule,
  ],
  providers: [SignalsService, SignalsDatabaseService, TelegramService, SignalBroadcastService],
  exports: [SignalsService, SignalBroadcastService],
})
export class SignalsModule {} 