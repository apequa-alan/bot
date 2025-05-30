import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignalsService } from './signals.service';
import { SignalsDatabaseService } from './signals-database.service';
import { Signal } from './entities/signal.entity';
import { TelegramModule } from '../telegram/telegram.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SignalMetricsService } from './signal-metrics.service';
import { SignalFormatterService } from './signal-formatter.service';
import { SignalDispatcherService } from './signal-dispatcher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Signal]),
    forwardRef(() => TelegramModule),
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [
    SignalsService,
    SignalsDatabaseService,
    SignalMetricsService,
    SignalFormatterService,
    SignalDispatcherService,
  ],
  exports: [
    SignalsService,
    SignalMetricsService,
    SignalFormatterService,
    SignalDispatcherService,
  ],
})
export class SignalsModule {} 