import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import {
  formatErrorForMarkdown,
  formatHeaderForMarkdown,
  escapeMarkdownV2,
} from '../telegram.utils';

@Injectable()
export class MessageHandler {
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

  async sendDirectMessage(userId: string, message: string): Promise<void> {
    try {
      const escapedMessage = escapeMarkdownV2(message);
      await this.bot.telegram.sendMessage(userId, escapedMessage, {
        parse_mode: 'MarkdownV2',
      });
    } catch (err) {
      console.error('Error sending direct message:', err);
      // Fallback to plain text if markdown fails
      try {
        await this.bot.telegram.sendMessage(userId, message, {
          parse_mode: undefined,
        });
      } catch (fallbackErr) {
        console.error('Error sending fallback message:', fallbackErr);
      }
    }
  }

  async sendDirectError(userId: string, error: unknown, context?: string): Promise<void> {
    const errorMessage = formatErrorForMarkdown(error);
    const message = context 
      ? `${formatHeaderForMarkdown(context)}\n${errorMessage}`
      : errorMessage;
    await this.sendDirectMessage(userId, message);
  }

  async sendDirectInfo(userId: string, header: string, content: string): Promise<void> {
    const formattedHeader = formatHeaderForMarkdown(header);
    const message = `${formattedHeader}\n${content}`;
    await this.sendDirectMessage(userId, message);
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
      const escapedMessage = escapeMarkdownV2(prefix + message);
      console.log(`[TELEGRAM] ${message}`);
      const result = await this.bot.telegram.sendMessage(
        this.channelId,
        escapedMessage,
        { parse_mode: 'MarkdownV2' },
      );
      return result.message_id;
    } catch (err) {
      console.error('Ошибка отправки уведомления в Telegram:', err);
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

  async sendErrorNotification(error: unknown, context?: string): Promise<number> {
    const errorMessage = formatErrorForMarkdown(error);
    const message = context 
      ? `${formatHeaderForMarkdown(context)}\n${errorMessage}`
      : errorMessage;
    return this.sendNotification('error', message);
  }

  async sendInfoNotification(header: string, content: string): Promise<number> {
    const formattedHeader = formatHeaderForMarkdown(header);
    const message = `${formattedHeader}\n${content}`;
    return this.sendNotification('info', message);
  }
} 