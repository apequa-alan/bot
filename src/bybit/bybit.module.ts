import { Module } from '@nestjs/common';
import { BybitService } from './bybit.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  providers: [BybitService],
  exports: [BybitService],
})
export class BybitModule {}
