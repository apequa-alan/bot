import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly channelId: string;

  constructor(
    @InjectBot() private bot: Telegraf,
    private readonly configService: ConfigService,
  ) {
    this.channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID', '');
    if (!this.channelId) {
      throw new Error('TELEGRAM_CHANNEL_ID не задан в .env');
    }
  }

  onModuleInit() {
    this.bot.command('start', async (ctx) => {
      await ctx.reply('That is bot for sending signals');
    });
  }

  async sendNotification(type: 'error' | 'info' | 'fix', message: string) {
    let prefix = '';
    switch (type) {
      case 'error':
        prefix = '🔴 ';
        break;
      case 'info':
        prefix = '🔵 ';
        break;
      case 'fix':
        prefix = '🟢 ';
        break;
    }
    await this.bot.telegram.deleteMyCommands();

    try {
      await this.bot.telegram.sendMessage(this.channelId, prefix + message);
    } catch (err) {
      console.error('Ошибка отправки уведомления в Telegram:', err);
    }
  }
}
