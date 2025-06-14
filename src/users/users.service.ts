import dayjs from 'dayjs';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

import { User } from './entities/user.entity';
import { UsersRepository } from './users.repository';
import { TransactionsRepository } from './transactions.repository';
import { PLAN_CONFIG, UserPlan } from '../config/plan.config';

@Injectable()
export class UsersService {
  private readonly channelId: string;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly transactionsRepository: TransactionsRepository,
    private readonly configService: ConfigService,
    @InjectBot() private readonly bot: Telegraf,
  ) {
    this.channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID', '');
    if (!this.channelId) {
      throw new Error('TELEGRAM_CHANNEL_ID не задан в .env');
    }
  }

  async getUser(userId: string): Promise<User | null> {
    return this.usersRepository.findOne(userId);
  }

  async createIfNotExists(userId: string): Promise<User> {
    const user = await this.getUser(userId);
    if (user) {
      return user;
    }

    const newUser = new User();
    newUser.id = userId;

    if (userId === this.channelId) {
      newUser.plan = 'pro';
      newUser.subscriptionLimit = PLAN_CONFIG.pro.limit;
      newUser.subscriptionExpiresAt = dayjs().add(2, 'year').toDate();
    } else {
      newUser.plan = 'free';
      newUser.subscriptionLimit = PLAN_CONFIG.free.limit;
      newUser.subscriptionExpiresAt = null;
    }

    return this.usersRepository.save(newUser);
  }

  async updatePlan(
    userId: string,
    plan: UserPlan,
    paymentInfo: {
      telegramPaymentChargeId: string;
      telegramPaymentInvoiceId: string;
      currency: string;
      amount: number;
      description?: string;
      providerPaymentChargeId?: string;
      shippingOptionId?: string;
      orderInfo?: Record<string, any>;
    },
  ): Promise<User> {
    try {
      const user = await this.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Log plan change
      console.log(`Updating plan for user ${userId}: ${user.plan} -> ${plan}`);

      const config = PLAN_CONFIG[plan];
      const expiresAt =
        plan === 'free'
          ? null
          : new Date(Date.now() + config.durationDays * 24 * 60 * 60 * 1000);

      // Store old values for logging
      const oldPlan = user.plan;
      const oldLimit = user.subscriptionLimit;
      const oldExpiresAt = user.subscriptionExpiresAt;

      // Update user
      user.plan = plan;
      user.subscriptionLimit = config.limit;
      user.subscriptionExpiresAt = expiresAt;

      const updatedUser = await this.usersRepository.save(user);

      // Create transaction record
      const transaction = await this.transactionsRepository.create({
        userId,
        plan,
        telegramPaymentChargeId: paymentInfo.telegramPaymentChargeId,
        telegramPaymentInvoiceId: paymentInfo.telegramPaymentInvoiceId,
        currency: paymentInfo.currency,
        amount: paymentInfo.amount,
        description: paymentInfo.description,
        providerPaymentChargeId: paymentInfo.providerPaymentChargeId,
        shippingOptionId: paymentInfo.shippingOptionId,
        orderInfo: paymentInfo.orderInfo,
      });

      // Log changes
      console.log(`Plan updated for user ${userId}:`, {
        oldPlan,
        newPlan: updatedUser.plan,
        oldLimit,
        newLimit: updatedUser.subscriptionLimit,
        oldExpiresAt: oldExpiresAt?.toISOString(),
        newExpiresAt: updatedUser.subscriptionExpiresAt?.toISOString(),
        transactionId: transaction.id,
        paymentDate: transaction.createdAt.toISOString(),
      });

      return updatedUser;
    } catch (error) {
      console.error(`Error updating plan for user ${userId}:`, error);
      throw new Error(`Failed to update plan: ${error.message}`);
    }
  }
}
