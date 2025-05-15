import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import {
  formatErrorForMarkdown,
  formatHeaderForMarkdown,
  escapeMarkdownV2,
} from './telegram.utils';

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
      // Escape the entire message including prefix before sending
      const escapedMessage = escapeMarkdownV2(prefix + message);
      console.log(`[TELEGRAM] ${message}`); // Log original message for debugging
      const result = await this.bot.telegram.sendMessage(
        this.channelId,
        escapedMessage,
        { parse_mode: 'MarkdownV2' },
      );
      return result.message_id;
    } catch (err) {
      console.error('Ошибка отправки уведомления в Telegram:', err);
      // If message formatting fails, try sending without markdown
      try {
        const fallbackMessage = prefix + 'Ошибка форматирования сообщения. Отправка без форматирования.';
        const result = await this.bot.telegram.sendMessage(
          this.channelId,
          fallbackMessage,
          { parse_mode: undefined },
        );
        return result.message_id;
      } catch (fallbackErr) {
        console.error('Ошибка отправки fallback сообщения:', fallbackErr);
        return 0;
      }
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
      // Escape the entire message including prefix before sending
      const escapedMessage = escapeMarkdownV2(prefix + message);
      console.log(`[TELEGRAM] Reply to ${replyToMessageId}: ${message}`); // Log original message
      const result = await this.bot.telegram.sendMessage(
        this.channelId,
        escapedMessage,
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

  /**
   * Formats and sends an error notification
   * @param error The error to send
   * @param context Optional context message
   * @returns Message ID
   */
  async sendErrorNotification(error: unknown, context?: string): Promise<number> {
    const errorMessage = formatErrorForMarkdown(error);
    const message = context 
      ? `${formatHeaderForMarkdown(context)}\n${errorMessage}`
      : errorMessage;
    return this.sendNotification('error', message);
  }

  /**
   * Formats and sends an info notification with a header
   * @param header The header text
   * @param content The content text
   * @returns Message ID
   */
  async sendInfoNotification(header: string, content: string): Promise<number> {
    // Format header and content without escaping
    const formattedHeader = formatHeaderForMarkdown(header);
    const message = `${formattedHeader}\n${content}`;
    return this.sendNotification('info', message);
  }
}
