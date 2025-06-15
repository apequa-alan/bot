import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Markup, Telegraf } from 'telegraf';
import { formatErrorForHtml, parseSubscriptionMessage } from './telegram.utils';
import { SubscriptionsService } from '../trading-bot/subscriptions/subscriptions.service';
import {
  SUPPORTED_INTERVALS,
  validateAndNormalizeInterval,
} from '../trading-bot/utils/interval.utils';
import { PLAN_CONFIG } from '../config/plan.config';
import { UsersService } from '../users/users.service';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly channelId: string;
  private readonly mainKeyboard = Markup.keyboard([
    ['📊 Мой статус', '📘 Команды'],
    ['📋 Подписки'],
  ]).resize();

  constructor(
    @InjectBot() private bot: Telegraf,
    private readonly configService: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usersService: UsersService,
  ) {
    this.channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID', '');
    if (!this.channelId) {
      throw new Error('TELEGRAM_CHANNEL_ID не задан в .env');
    }
  }

  onModuleInit() {
    this.bot.command('start', async (ctx) => {
      const userId = ctx.from.id.toString();
      await this.usersService.createIfNotExists(userId);
      await this.sendWelcomeMessage(ctx);
    });

    this.bot.command('help', async (ctx) => {
      await this.handleHelpCommand(ctx);
    });

    this.bot.command('subscribe', async (ctx) => {
      await this.handleSubscribeCommand(ctx);
    });

    this.bot.command('buy', async (ctx) => {
      await this.handleBuyCommand(ctx);
    });

    this.bot.hears('status', async (ctx) => {
      await this.handleStatusCommand(ctx);
    });

    this.bot.hears('📊 Мой статус', async (ctx) => {
      await this.handleMyStatus(ctx);
    });

    this.bot.hears('📘 Команды', async (ctx) => {
      await this.handleHelpCommand(ctx);
    });

    this.bot.hears('📋 Подписки', async (ctx) => {
      await this.handleSubscriptionsCommand(ctx);
    });

    this.bot.action('show_help', async (ctx) => {
      await this.handleHelpCallback(ctx);
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

    this.bot.action('refresh_subscriptions', async (ctx) => {
      await this.handleRefreshSubscriptionsCallback(ctx);
    });

    this.bot.action('clear_all_subscriptions', async (ctx) => {
      await this.handleClearAllCommand(ctx);
    });

    this.bot.action('buy_pro', async (ctx) => {
      await this.handleBuyPlanCallback(ctx, 'pro');
    });

    this.bot.action('buy_premium', async (ctx) => {
      await this.handleBuyPlanCallback(ctx, 'premium');
    });

    this.bot.action('back_to_plans', async (ctx) => {
      await this.handleBuyCommand(ctx);
    });

    this.bot.action(/^pay_(pro|premium)$/, async (ctx) => {
      const plan = ctx.match[1] as 'pro' | 'premium';
      await this.handlePaymentCallback(ctx, plan);
    });

    this.bot.on('pre_checkout_query', async (ctx) => {
      await ctx.answerPreCheckoutQuery(true);
    });

    this.bot.on('successful_payment', async (ctx) => {
      await this.handleSuccessfulPayment(ctx);
    });
  }

  private async handleHelpCommand(ctx: Context): Promise<void> {
    try {
      const helpMessage = this.formatHelpMessage();
      await ctx.reply(helpMessage, {
        parse_mode: 'HTML',
        ...this.mainKeyboard,
      });
    } catch (error) {
      console.error('Error handling help command:', error);
      await ctx.reply(
        'Произошла ошибка при отображении справки',
        this.mainKeyboard,
      );
    }
  }

  private async handleHelpCallback(ctx: Context): Promise<void> {
    try {
      const helpMessage = this.formatHelpMessage();

      await ctx.editMessageText(helpMessage, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Назад', callback_data: 'back_to_welcome' }],
            [{ text: '🔁 Обновить список', callback_data: 'show_help' }],
          ],
        },
      });
    } catch (error) {
      console.error('Error handling help callback:', error);
      await ctx.answerCbQuery('Произошла ошибка при отображении справки');
    }
  }

  private formatHelpMessage(): string {
    const supportedIntervals = Object.keys(SUPPORTED_INTERVALS).join(', ');

    return (
      '<b>📘 Список команд</b>\n\n' +
      '<b>🔹 Подписка на сигналы:</b>\n' +
      '• <code>/subscribe SYMBOL INTERVAL</code> — подписаться\n' +
      '  <i>Пример:</i> <code>/subscribe SUIUSDT 15m</code>\n\n' +
      '<b>🔹 Управление подписками:</b>\n' +
      '• <code>/subscriptions</code> — список активных подписок\n' +
      '• <code>/unsubscribe SYMBOL INTERVAL</code> — отключить подписку\n' +
      '  <i>Пример:</i> <code>/unsubscribe SUIUSDT 15m</code>\n' +
      '• <code>/clearall</code> — отключить все подписки\n\n' +
      '<b>ℹ️ Информация:</b>\n' +
      '• Символы берем из названий фьючерсных контрактов на бирже Bybit\n' +
      '• Поддерживаемые интервалы:\n' +
      supportedIntervals
    );
  }

  private async sendWelcomeMessage(ctx: Context): Promise<void> {
    try {
      if (!ctx.from) {
        throw new Error('User information not available');
      }
      const userId = ctx.from.id.toString();
      await this.usersService.createIfNotExists(userId);

      await ctx.reply(
        '👋 Добро пожаловать в Macd Strategy Bot!\n\n' +
          'Я являюсь частью экосистемы <a href="https://t.me/snap_trade">Snap Trade</a> \n\n' +
          'Я помогу вам получать торговые сигналы по индикатору MACD (+ подтверждение по объемам + подтверждение с старших таймфреймов).\n\n' +
          'Используйте команду /help для просмотра списка команд.',
        {
          parse_mode: 'HTML',
          ...this.mainKeyboard,
        },
      );

      // Show detailed status after welcome message
      await this.handleMyStatus(ctx);
    } catch (error) {
      console.error('Error sending welcome message:', error);
      await ctx.reply(
        'Произошла ошибка при отправке приветственного сообщения',
        this.mainKeyboard,
      );
    }
  }

  private async handleSubscriptionMessage(ctx: Context): Promise<void> {
    if (!ctx.message || !('text' in ctx.message)) return;

    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply(
        'Ошибка: Не удалось определить пользователя',
        this.mainKeyboard,
      );
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
      if (
        error instanceof Error &&
        error.message === 'Subscription limit reached'
      ) {
        const user = await this.usersService.getUser(userId);
        if (!user) {
          await ctx.reply('Ошибка: Пользователь не найден', this.mainKeyboard);
          return;
        }

        const message =
          '❌ <b>Достигнут лимит подписок!</b>\n\n' +
          `У вас ${user.subscriptionLimit} активных подписок.\n` +
          'Чтобы добавить больше подписок, обновите ваш план:\n\n' +
          `• PRO: ${PLAN_CONFIG.pro.limit} подписок за ${PLAN_CONFIG.pro.priceStars}⭐\n` +
          `• PREMIUM: ${PLAN_CONFIG.premium.limit} подписок за ${PLAN_CONFIG.premium.priceStars}⭐`;

        await ctx.reply(message, {
          parse_mode: 'HTML',
          ...this.mainKeyboard,
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛒 Купить план', callback_data: 'show_plans' }],
            ],
          },
        });
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Неверный формат подписки';
      await ctx.reply(
        `❌ ${errorMessage}\n\n` +
          'Используйте формат: SYMBOL INTERVAL\n' +
          'Например: SUIUSDT 15m\n\n' +
          'Или команду: /subscribe SYMBOL INTERVAL',
        this.mainKeyboard,
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
      const subscriptions =
        await this.subscriptionsService.getUserSubscriptions(userId);
      if (subscriptions.length === 0) {
        await ctx.reply(
          'У вас нет активных подписок.\n\n' +
            'Чтобы подписаться, отправьте сообщение с символом и интервалом (например: SUIUSDT 15m)',
          {
            ...this.mainKeyboard,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🔄 Обновить',
                    callback_data: 'refresh_subscriptions',
                  },
                ],
              ],
            },
          },
        );
        return;
      }

      const message = subscriptions
        .map((sub) => {
          const takeProfit = sub.takeProfit
            ? `\nTake Profit: ${sub.takeProfit}%`
            : '';
          return `🔔 ${sub.symbol} ${sub.interval}${takeProfit}`;
        })
        .join('\n\n');

      await ctx.reply(
        '<b>📋 Ваши активные подписки:</b>\n\n' +
          message +
          '\n\nЧтобы добавить еще, отправьте сообщение с символом и интервалом (например: SUIUSDT 15m)',
        {
          parse_mode: 'HTML',
          ...this.mainKeyboard,
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Обновить', callback_data: 'refresh_subscriptions' }],
              [
                {
                  text: '❌ Отключить все',
                  callback_data: 'clear_all_subscriptions',
                },
              ],
            ],
          },
        },
      );
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      await ctx.reply(
        '❌ Ошибка при получении списка подписок. Пожалуйста, попробуйте позже.',
        this.mainKeyboard,
      );
    }
  }

  private async handleRefreshSubscriptionsCallback(
    ctx: Context,
  ): Promise<void> {
    try {
      await ctx.answerCbQuery('Обновление списка подписок...');
      await this.handleSubscriptionsCommand(ctx);
    } catch (error) {
      console.error('Error handling refresh subscriptions callback:', error);
      await ctx.answerCbQuery('❌ Ошибка при обновлении списка подписок');
    }
  }

  private async handleUnsubscribeCommand(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply('Ошибка: Не удалось определить пользователя');
      return;
    }

    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('Ошибка: Неверный формат команды');
      return;
    }

    // Extract symbol and interval from command
    const parts = ctx.message.text.split(/\s+/);
    if (parts.length !== 3) {
      await ctx.reply(
        '❌ Неверный формат команды.\n\n' +
          'Используйте: /unsubscribe SYMBOL INTERVAL\n' +
          'Пример: /unsubscribe SUIUSDT 15m',
        this.mainKeyboard,
      );
      return;
    }

    const [, symbol, interval] = parts;

    try {
      const normalizedInterval = validateAndNormalizeInterval(interval);
      const subscription =
        await this.subscriptionsService.deactivateSubscription(
          userId,
          symbol,
          normalizedInterval,
        );

      if (!subscription) {
        await ctx.reply(
          `❌ Не найдена активная подписка для ${symbol} ${normalizedInterval}.\n\n` +
            'Используйте /subscriptions для просмотра активных подписок.',
          this.mainKeyboard,
        );
        return;
      }

      await ctx.reply(
        `✅ Успешно отключена подписка на ${symbol} ${normalizedInterval}`,
        this.mainKeyboard,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Неверный формат интервала';
      await ctx.reply(
        `❌ ${errorMessage}\n\n` +
          'Используйте формат: /unsubscribe SYMBOL INTERVAL\n' +
          'Пример: /unsubscribe SUIUSDT 15m',
        this.mainKeyboard,
      );
    }
  }

  private async handleClearAllCommand(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply(
        'Ошибка: Не удалось определить пользователя',
        this.mainKeyboard,
      );
      return;
    }

    try {
      await this.subscriptionsService.deactivateAllUserSubscriptions(userId);
      await ctx.reply('✅ Все ваши подписки были отключены', this.mainKeyboard);
    } catch (error) {
      console.error('Error clearing subscriptions:', error);
      await ctx.reply(
        '❌ Ошибка при отключении подписок. Пожалуйста, попробуйте позже.',
        this.mainKeyboard,
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
        this.mainKeyboard,
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
        this.mainKeyboard,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Неверный формат интервала';
      await ctx.reply(
        `❌ ${errorMessage}\n\n` +
          'Используйте формат: /subscribe SYMBOL INTERVAL\n' +
          'Например: /subscribe SUIUSDT 15m',
        this.mainKeyboard,
      );
    }
  }

  private async handleBuyCommand(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.reply(
          'Ошибка: Не удалось определить пользователя',
          this.mainKeyboard,
        );
        return;
      }

      let user = await this.usersService.getUser(userId);
      if (!user) {
        user = await this.usersService.createIfNotExists(userId);
      }

      const message =
        '<b>💎 Выберите план подписки</b>\n\n' +
        `<b>Pro Plan (${PLAN_CONFIG.pro.priceStars}⭐)</b>\n` +
        `• До ${PLAN_CONFIG.pro.limit} активных подписок\n` +
        `• Срок действия: ${PLAN_CONFIG.pro.durationDays} дней\n\n` +
        `<b>Premium Plan (${PLAN_CONFIG.premium.priceStars}⭐)</b>\n` +
        `• До ${PLAN_CONFIG.premium.limit} активных подписок\n` +
        `• Срок действия: ${PLAN_CONFIG.premium.durationDays} дней\n\n` +
        'Ваш текущий план: ' +
        user.plan.toUpperCase();

      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `Pro Plan (${PLAN_CONFIG.pro.priceStars}⭐)`,
                callback_data: 'buy_pro',
              },
              {
                text: `Premium Plan (${PLAN_CONFIG.premium.priceStars}⭐)`,
                callback_data: 'buy_premium',
              },
            ],
          ],
        },
      });
    } catch (error) {
      console.error('Error handling buy command:', error);
      await ctx.reply(
        'Произошла ошибка при отображении планов подписки',
        this.mainKeyboard,
      );
    }
  }

  private async handleBuyPlanCallback(
    ctx: Context,
    plan: 'pro' | 'premium',
  ): Promise<void> {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.answerCbQuery('Ошибка: Не удалось определить пользователя');
        return;
      }

      const config = PLAN_CONFIG[plan];

      // Show payment instructions for Stars
      await ctx.editMessageText(
        `Вы выбрали ${plan.toUpperCase()} Plan\n\n` +
          `Стоимость: ${config.priceStars}⭐\n` +
          `Лимит подписок: ${config.limit}\n` +
          `Срок действия: ${config.durationDays} дней\n\n` +
          'Нажмите "Оплатить" для перехода к оплате.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `Оплатить ${config.priceStars}⭐`,
                  callback_data: `pay_${plan}`,
                },
              ],
              [{ text: '🔙 Назад к планам', callback_data: 'back_to_plans' }],
            ],
          },
        },
      );
    } catch (error) {
      console.error('Error handling buy plan callback:', error);
      await ctx.answerCbQuery('Произошла ошибка при выборе плана');
    }
  }

  private async handlePaymentCallback(
    ctx: Context,
    plan: 'pro' | 'premium',
  ): Promise<void> {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.answerCbQuery('Ошибка: Не удалось определить пользователя');
        return;
      }

      const config = PLAN_CONFIG[plan];

      await ctx.replyWithInvoice({
        title: `${plan.toUpperCase()} Plan`,
        description: `Доступ к ${config.limit} подпискам на ${config.durationDays} дней`,
        payload: plan,
        provider_token: '',
        currency: 'XTR',
        prices: [
          {
            label: `${plan.toUpperCase()} Plan`,
            amount: config.priceStars,
          },
        ],
        start_parameter: `buy_${plan}`,
      });

      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling payment callback:', error);
      await ctx.answerCbQuery('Произошла ошибка при создании платежа');
    }
  }

  private async handleSuccessfulPayment(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        throw new Error('Could not identify user');
      }

      if (!ctx.message || !('successful_payment' in ctx.message)) {
        throw new Error('Invalid payment message');
      }

      const plan = ctx.message.successful_payment.invoice_payload as
        | 'pro'
        | 'premium';

      const user = await this.usersService.updatePlan(userId, plan, {
        telegramPaymentChargeId:
          ctx.message.successful_payment.telegram_payment_charge_id,
        telegramPaymentInvoiceId:
          ctx.message.successful_payment.invoice_payload,
        currency: ctx.message.successful_payment.currency,
        amount: ctx.message.successful_payment.total_amount,
      });

      const message =
        '<b>✅ Оплата прошла успешно!</b>\n\n' +
        '<b>Ваш план обновлен:</b>\n' +
        `• План: <b>${user.plan.toUpperCase()}</b>\n` +
        `• Лимит подписок: <b>${user.subscriptionLimit}</b>\n` +
        `• Действует до: <b>${user.subscriptionExpiresAt?.toLocaleDateString() || 'бессрочно'}</b>\n\n` +
        '<b>💡 Что дальше?</b>\n' +
        '• Используйте команду /subscribe для создания подписок\n' +
        '• Команда /help покажет все доступные команды';

      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...this.mainKeyboard,
      });

      // Show detailed status after successful payment
      await this.handleMyStatus(ctx);
    } catch (error) {
      console.error('Error handling successful payment:', error);
      await ctx.reply(
        'Произошла ошибка при обновлении плана. Пожалуйста, обратитесь в поддержку.',
        this.mainKeyboard,
      );
    }
  }

  private async handleStatusCommand(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.reply('Ошибка: Не удалось определить пользователя');
        return;
      }

      const user = await this.usersService.getUser(userId);
      if (!user) {
        await ctx.reply('Ошибка: Пользователь не найден');
        return;
      }

      const subscriptions =
        await this.subscriptionsService.getUserSubscriptions(userId);
      const usedSubscriptions = subscriptions.length;
      const config = PLAN_CONFIG[user.plan];

      const message =
        '<b>📊 Ваш статус:</b>\n\n' +
        `<b>План:</b> ${user.plan.toUpperCase()}\n` +
        `<b>Лимит подписок:</b> ${usedSubscriptions}/${config.limit}\n` +
        `<b>Действует до:</b> ${user.subscriptionExpiresAt?.toLocaleDateString() || 'бессрочно'}\n\n` +
        (user.plan === 'free'
          ? '<b>💡 Хотите больше подписок?</b>\n' +
            'Используйте команду /buy для просмотра доступных планов'
          : '');

      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...this.mainKeyboard,
        reply_markup:
          user.plan === 'free'
            ? {
                inline_keyboard: [
                  [{ text: '🛒 Купить план', callback_data: 'show_plans' }],
                ],
              }
            : undefined,
      });
    } catch (error) {
      console.error('Error handling status command:', error);
      await ctx.reply(
        'Произошла ошибка при получении статуса. Пожалуйста, попробуйте позже.',
        this.mainKeyboard,
      );
    }
  }

  private async handleMyStatus(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.reply('Ошибка: Не удалось определить пользователя');
        return;
      }

      const user = await this.usersService.getUser(userId);
      if (!user) {
        await ctx.reply('Ошибка: Пользователь не найден');
        return;
      }

      const subscriptions =
        await this.subscriptionsService.getUserSubscriptions(userId);
      const usedSubscriptions = subscriptions.length;
      const config = PLAN_CONFIG[user.plan];

      // Get up to 5 active subscriptions
      const activeSubscriptions = subscriptions
        .slice(0, 5)
        .map((sub) => `• ${sub.symbol} ${sub.interval}`)
        .join('\n');

      const message =
        '<b>📊 Ваш статус</b>\n\n' +
        `<b>🪪 Текущий план:</b> ${user.plan.toUpperCase()}\n` +
        `<b>🔢 Подписки:</b> ${usedSubscriptions}/${config.limit}\n` +
        `<b>📆 Действует до:</b> ${user.subscriptionExpiresAt?.toLocaleDateString() || 'бессрочно'}\n\n` +
        (activeSubscriptions
          ? `<b>📋 Активные подписки:</b>\n${activeSubscriptions}\n\n`
          : '') +
        '<b>📘 Полезные команды:</b>\n' +
        '• /subscribe SYMBOL INTERVAL — создать подписку\n' +
        '• /unsubscribe SYMBOL INTERVAL — отключить подписку\n' +
        '• /buy — купить PRO или PREMIUM план\n' +
        '• /help — показать все команды';

      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...this.mainKeyboard,
      });
    } catch (error) {
      console.error('Error handling my status:', error);
      await ctx.reply(
        'Произошла ошибка при получении статуса. Пожалуйста, попробуйте позже.',
        this.mainKeyboard,
      );
    }
  }

  async sendNotification(
    type: 'error' | 'info' | 'fix',
    message: string,
    userId: string,
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
      console.log(`[TELEGRAM] ${message}`); // Log original message for debugging
      const result = await this.bot.telegram.sendMessage(
        userId,
        prefix + message,
        { parse_mode: 'HTML' },
      );
      return result.message_id;
    } catch (err) {
      console.error('Ошибка отправки уведомления в Telegram:', err);
      // If message formatting fails, try sending without formatting
      try {
        const fallbackMessage =
          prefix +
          'Ошибка форматирования сообщения. Отправка без форматирования.';
        const result = await this.bot.telegram.sendMessage(
          userId,
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
    userId: string,
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
      console.log(`[TELEGRAM] Reply to ${replyToMessageId}: ${message}`); // Log original message
      const result = await this.bot.telegram.sendMessage(
        userId,
        prefix + message,
        {
          reply_to_message_id: replyToMessageId,
          allow_sending_without_reply: true,
          parse_mode: 'HTML',
        } as any,
      );
      return result.message_id;
    } catch (err) {
      console.error(
        `Ошибка отправки ответа на сообщение ${replyToMessageId}:`,
        err,
      );
      // Fallback to regular message if reply fails
      return this.sendNotification(type, message, userId);
    }
  }

  async sendErrorNotification({
    error,
    context,
    userId,
  }: {
    error: unknown;
    context?: string;
    userId: string;
  }): Promise<number> {
    const errorMessage = formatErrorForHtml(error);
    const message = context
      ? `<b>${context}</b>\n${errorMessage}`
      : errorMessage;
    return this.sendNotification('error', message, userId);
  }

  async sendInfoNotification(
    title: string,
    content: string,
    userId: string,
  ): Promise<number> {
    const message = `<b>${title}</b>\n\n${content}`;
    const response = await this.bot.telegram.sendMessage(userId, message, {
      parse_mode: 'HTML',
    });
    return response.message_id;
  }

  async sendDirectMessage(userId: string, message: string): Promise<number> {
    try {
      const result = await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: 'HTML',
      });
      return result.message_id;
    } catch (error) {
      console.error(`Failed to send direct message to ${userId}:`, error);
      throw error;
    }
  }

  async deleteMessage(messageId: number, userId: string): Promise<void> {
    try {
      await this.bot.telegram.deleteMessage(userId, messageId);
    } catch (error) {
      console.error(
        `Failed to delete message ${messageId} for user ${userId}:`,
        error,
      );
      // Don't throw error to prevent blocking the signal update process
    }
  }
}
