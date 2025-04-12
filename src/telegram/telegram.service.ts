import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

@Injectable()
export class TelegramService {
  private readonly chatId: string;

  constructor(
    @InjectBot() private bot: Telegraf,
    private readonly configService: ConfigService,
  ) {
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID', '');
    if (!this.chatId) {
      throw new Error('TELEGRAM_CHAT_ID не задан в .env');
    }
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

    try {
      await this.bot.telegram.sendMessage(this.chatId, prefix + message);
    } catch (err) {
      console.error('Ошибка отправки уведомления в Telegram:', err);
    }
  }
} 