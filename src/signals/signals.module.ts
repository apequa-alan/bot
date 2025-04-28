import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignalsService } from './signals.service';
import { SignalsDatabaseService } from './signals-database.service';
import { TelegramService } from '../telegram/telegram.service';
import { Signal } from './entities/signal.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Signal])],
  providers: [SignalsService, SignalsDatabaseService, TelegramService],
  exports: [SignalsService],
})
export class SignalsModule {} 