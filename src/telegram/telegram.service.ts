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

  /**
   * Escapes special characters for Telegram's MarkdownV2 format
   * @param text The text to escape
   * @returns Escaped text safe for MarkdownV2
   */
  private escapeMarkdown(text: string): string {
    // Characters that need to be escaped in MarkdownV2: _*[]()~`>#+-=|{}.!
    return text.replace(/([_*[\]()~`>#+=|{}.!\\])/g, '\\$1');
  }

  async sendNotification(
    type: 'error' | 'info' | 'fix',
    message: string,
  ): Promise<number> {
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
      const fullMessage = this.escapeMarkdown(prefix + message);
      console.log(`[TELEGRAM] ${prefix + message}`);
      const result = await this.bot.telegram.sendMessage(
        this.channelId,
        fullMessage,
        { parse_mode: 'MarkdownV2' },
      );
      return result.message_id; // Return the message ID for future replies
    } catch (err) {
      console.error('Ошибка отправки уведомления в Telegram:', err);
      return 0;
    }
  }

  async sendReplyNotification(
    type: 'error' | 'info' | 'fix',
    message: string,
    replyToMessageId: number,
  ): Promise<number> {
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
      const fullMessage = this.escapeMarkdown(prefix + message);
      console.log(
        `[TELEGRAM] Reply to ${replyToMessageId}: ${prefix + message}`,
      );
      const result = await this.bot.telegram.sendMessage(
        this.channelId,
        fullMessage,
        {
          reply_to_message_id: replyToMessageId,
          allow_sending_without_reply: true,
          parse_mode: 'MarkdownV2',
        } as any,
      );
      return result.message_id;
    } catch (err) {
      console.error(
        `Ошибка отправки ответа на сообщение ${replyToMessageId}:`,
        err,
      );
      // Fallback to regular message if reply fails
      return this.sendNotification(type, message);
    }
  }
}
