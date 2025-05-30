import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BybitService } from './bybit.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => TelegramModule),
  ],
  providers: [BybitService],
  exports: [BybitService],
})
export class BybitModule {}
