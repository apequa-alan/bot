import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import {
  formatErrorForMarkdown,
  formatHeaderForMarkdown,
  escapeMarkdownV2,
  parseSubscriptionMessage,
} from './telegram.utils';
import { SubscriptionsService } from '../trading-bot/subscriptions/subscriptions.service';
import { validateAndNormalizeInterval, SUPPORTED_INTERVALS } from '../trading-bot/utils/interval.utils';
import { Markup } from 'telegraf';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly channelId: string;
  private readonly mainKeyboard = Markup.keyboard([
    ['📘 Команды']
  ]).resize();

  constructor(
    @InjectBot() private bot: Telegraf,
    private readonly configService: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {
    this.channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID', '');
    if (!this.channelId) {
      throw new Error('TELEGRAM_CHANNEL_ID не задан в .env');
    }
  }

  onModuleInit() {
    this.bot.command('start', async (ctx) => {
      await this.sendWelcomeMessage(ctx);
    });

    this.bot.command('help', async (ctx) => {
      await this.handleHelpCommand(ctx);
    });

    this.bot.command('subscribe', async (ctx) => {
      await this.handleSubscribeCommand(ctx);
    });

    this.bot.hears('📘 Команды', async (ctx) => {
      await this.handleHelpCommand(ctx);
    });

    this.bot.action('show_help', async (ctx) => {
      await this.handleHelpCallback(ctx);
    });

    this.bot.action('back_to_welcome', async (ctx) => {
      await this.handleBackToWelcomeCallback(ctx);
    });

    this.bot.command('subscriptions', async (ctx) => {
      await this.handleSubscriptionsCommand(ctx);
    });

    this.bot.command('unsubscribe', async (ctx) => {
      await this.handleUnsubscribeCommand(ctx);
    });

    // Handle subscription messages
    this.bot.on('text', async (ctx) => {
      await this.handleSubscriptionMessage(ctx);
    });
  }

  private async handleHelpCommand(ctx: Context): Promise<void> {
    try {
      const helpMessage = this.formatHelpMessage();
      await ctx.reply(helpMessage, { 
        parse_mode: 'Markdown',
        ...this.mainKeyboard
      });
    } catch (error) {
      console.error('Error handling help command:', error);
      await ctx.reply('Произошла ошибка при отображении справки', this.mainKeyboard);
    }
  }

  private async handleHelpCallback(ctx: Context): Promise<void> {
    try {
      const helpMessage = this.formatHelpMessage();
      
      await ctx.editMessageText(
        helpMessage,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Назад', callback_data: 'back_to_welcome' }],
              [{ text: '🔁 Обновить список', callback_data: 'show_help' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error handling help callback:', error);
      await ctx.answerCbQuery('Произошла ошибка при отображении справки');
    }
  }

  private formatHelpMessage(): string {
    const supportedIntervals = Object.keys(SUPPORTED_INTERVALS).join(', ');
    
    return '📘 *Список команд*\n\n' +
      '🔹 *Подписка на сигналы:*\n' +
      '• `/subscribe SYMBOL INTERVAL` — подписаться\n' +
      '  _Пример:_ `/subscribe SUIUSDT 15m`\n\n' +
      '🔹 *Управление подписками:*\n' +
      '• `/subscriptions` — список активных подписок\n' +
      '• `/unsubscribe SYMBOL INTERVAL` — отключить подписку\n' +
      '  _Пример:_ `/unsubscribe SUIUSDT 15m`\n\n' +
      'ℹ️ *Информация:*\n' +
      '• Символы берем из названий фьючерсных контрактов на бирже Bybit\n' +
      '• Поддерживаемые интервалы:\n' +
      '  `' + supportedIntervals + '`';
  }

  private async handleBackToWelcomeCallback(ctx: Context): Promise<void> {
    try {
      await ctx.editMessageText(
        '👋 Добро пожаловать в Trading Signals Bot!\n\n' +
        'Я помогу вам получать торговые сигналы.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📘 Команды', callback_data: 'show_help' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error handling back to welcome callback:', error);
      await ctx.answerCbQuery('Произошла ошибка при возврате в главное меню');
    }
  }

  private async sendWelcomeMessage(ctx: Context): Promise<void> {
    try {
      const inlineKeyboard = Markup.inlineKeyboard([
        Markup.button.callback('📘 Команды', 'show_help')
      ]);

      await ctx.reply(
        '👋 Добро пожаловать в Trading Signals Bot!\n\n' +
        'Я помогу вам получать торговые сигналы.\n\n' +
        'Используйте команду /help для просмотра списка команд.',
        {
          ...inlineKeyboard,
          ...this.mainKeyboard
        }
      );
    } catch (error) {
      console.error('Error sending welcome message:', error);
      await ctx.reply('Произошла ошибка при отправке приветственного сообщения', this.mainKeyboard);
    }
  }

  private async handleSubscriptionMessage(ctx: Context): Promise<void> {
    if (!ctx.message || !('text' in ctx.message)) return;

    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Error: Could not identify user', this.mainKeyboard);
      return;
    }

    // Skip if message starts with a command
    if (ctx.message.text.startsWith('/')) return;

    try {
      const { symbol, interval } = parseSubscriptionMessage(ctx.message.text);
      const normalizedInterval = validateAndNormalizeInterval(interval);
      
      await this.subscriptionsService.createOrUpdateSubscription(
        userId,
        symbol,
        normalizedInterval,
      );

      const message = `✅ Подписка на ${symbol} ${normalizedInterval} успешно создана`;
      await ctx.reply(message, this.mainKeyboard);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неверный формат подписки';
      await ctx.reply(
        `❌ ${errorMessage}\n\n` +
        'Используйте формат: SYMBOL INTERVAL\n' +
        'Например: SUIUSDT 15m\n\n' +
        'Или команду: /subscribe SYMBOL INTERVAL\n' +
        'Например: /subscribe SUIUSDT 15m',
        this.mainKeyboard
      );
    }
  }

  private async handleSubscriptionsCommand(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Error: Could not identify user');
      return;
    }

    try {
      const subscriptions = await this.subscriptionsService.getUserSubscriptions(userId);
      if (subscriptions.length === 0) {
        await ctx.reply(
          'You have no active subscriptions.\n\n' +
          'To subscribe, send a message with symbol and interval (e.g. SUIUSDT 15m)',
          this.mainKeyboard
        );
        return;
      }

      const message = subscriptions
        .map(sub => {
          const takeProfit = sub.takeProfit 
            ? `\nTake Profit: ${sub.takeProfit}%`
            : '';
          return `🔔 ${sub.symbol} ${sub.interval}${takeProfit}`;
        })
        .join('\n\n');
      
      await ctx.reply(
        '📋 Your active subscriptions:\n\n' +
        message +
        '\n\nTo add more, send a message with symbol and interval (e.g. SUIUSDT 15m)',
        this.mainKeyboard
      );
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      await ctx.reply('❌ Error fetching your subscriptions. Please try again later.', this.mainKeyboard);
    }
  }

  private async handleUnsubscribeCommand(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Error: Could not identify user');
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('Error: Invalid command format');
      return;
    }

    // Extract symbol and interval from command
    const parts = ctx.message.text.split(/\s+/);
    if (parts.length !== 3) {
      await ctx.reply(
        '❌ Invalid command format.\n\n' +
        'Use: /unsubscribe SYMBOL INTERVAL\n' +
        'Example: /unsubscribe SUIUSDT 15m',
        this.mainKeyboard
      );
      return;
    }

    const [, symbol, interval] = parts;

    try {
      const normalizedInterval = validateAndNormalizeInterval(interval);
      const subscription = await this.subscriptionsService.deactivateSubscription(
        userId,
        symbol,
        normalizedInterval,
      );

      if (!subscription) {
        await ctx.reply(
          `❌ No active subscription found for ${symbol} ${normalizedInterval}.\n\n` +
          'Use /subscriptions to view your active subscriptions.',
          this.mainKeyboard
        );
        return;
      }

      await ctx.reply(`✅ Successfully unsubscribed from ${symbol} ${normalizedInterval}`, this.mainKeyboard);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid interval format';
      await ctx.reply(
        `❌ ${errorMessage}\n\n` +
        'Use format: /unsubscribe SYMBOL INTERVAL\n' +
        'Example: /unsubscribe SUIUSDT 15m',
        this.mainKeyboard
      );
    }
  }

  private async handleSubscribeCommand(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Error: Could not identify user', this.mainKeyboard);
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('Error: Invalid command format', this.mainKeyboard);
      return;
    }

    // Extract symbol and interval from command
    const parts = ctx.message.text.split(/\s+/);
    if (parts.length !== 3) {
      await ctx.reply(
        '❌ Неверный формат команды.\n\n' +
        'Используйте: /subscribe SYMBOL INTERVAL\n' +
        'Например: /subscribe SUIUSDT 15m',
        this.mainKeyboard
      );
      return;
    }

    const [, symbol, interval] = parts;

    try {
      const normalizedInterval = validateAndNormalizeInterval(interval);
      await this.subscriptionsService.createOrUpdateSubscription(
        userId,
        symbol,
        normalizedInterval,
      );

      await ctx.reply(
        `✅ Подписка на ${symbol} ${normalizedInterval} успешно создана`,
        this.mainKeyboard
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неверный формат интервала';
      await ctx.reply(
        `❌ ${errorMessage}\n\n` +
        'Используйте формат: /subscribe SYMBOL INTERVAL\n' +
        'Например: /subscribe SUIUSDT 15m',
        this.mainKeyboard
      );
    }
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

  async sendDirectMessage(userId: string, message: string): Promise<number> {
    try {
      const result = await this.bot.telegram.sendMessage(userId, message);
      return result.message_id;
    } catch (error) {
      console.error(`Failed to send direct message to ${userId}:`, error);
      throw error;
    }
  }
}
