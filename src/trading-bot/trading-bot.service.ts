import { forwardRef, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KlineIntervalV3, WebsocketClient } from 'bybit-api';

import { TelegramService } from '../telegram/telegram.service';
import { BybitService } from '../bybit/bybit.service';
import { calculateMACD } from './utils/macd.utils';
import { calculateSmoothedSMA } from './utils/sma.utils';
import { SymbolData, WsKlineV5 } from './types';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SignalsService } from '../signals/signals.service';
import { Signal } from '../signals/entities/signal.entity';
import { SubscriptionsService } from './subscriptions/subscriptions.service';
import {
  HIGHER_TIMEFRAME_MAP,
  SUPPORTED_INTERVALS,
} from './utils/interval.utils';
import dayjs from '../utils/dayjs';

const limit = 300;
const VALID_INTERVALS: KlineIntervalV3[] = Object.keys(
  SUPPORTED_INTERVALS,
) as KlineIntervalV3[];

@Injectable()
export class TradingBotService implements OnModuleInit {
  private ws: WebsocketClient;
  private readonly channelId: string;
  private readonly symbolData: Map<string, SymbolData> = new Map();
  private activeSubscriptions: Set<string> = new Set();
  private readonly TOP_VOLUME_COINS_COUNT = 10;
  private readonly ONE_HISTOGRAM_DIRECTION_CANDLES = 3;

  private readonly BYBIT_API_KEY: string;
  private readonly BYBIT_API_SECRET: string;
  private readonly INTERVAL: KlineIntervalV3;
  private readonly FAST_PERIOD: string;
  private readonly SLOW_PERIOD: string;
  private readonly SIGNAL_PERIOD: string;
  private readonly VOLUME_SMA_SMOOTHING_PERIOD: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly telegramService: TelegramService,
    private readonly bybitService: BybitService,
    private readonly signalsService: SignalsService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
  ) {
    this.BYBIT_API_KEY = this.configService.get<string>('BYBIT_API_KEY') ?? '';
    this.BYBIT_API_SECRET =
      this.configService.get<string>('BYBIT_API_SECRET') ?? '';
    this.INTERVAL = this.configService.get<string>(
      'INTERVAL',
      '1m',
    ) as KlineIntervalV3;
    this.FAST_PERIOD = this.configService.get<string>('FAST_PERIOD', '12');
    this.SLOW_PERIOD = this.configService.get<string>('SLOW_PERIOD', '26');
    this.SIGNAL_PERIOD = this.configService.get<string>('SIGNAL_PERIOD', '9');
    this.VOLUME_SMA_SMOOTHING_PERIOD = this.configService.get<string>(
      'VOLUME_SMA_SMOOTHING_PERIOD',
      '9',
    );
    this.channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID', '');
    if (!this.channelId) {
      throw new Error('TELEGRAM_CHANNEL_ID не задан в .env');
    }
  }

  async onModuleInit() {
    this.ws = new WebsocketClient({
      market: 'v5',
      key: this.BYBIT_API_KEY,
      secret: this.BYBIT_API_SECRET,
    });
    await this.startBot();
  }

  private validateInterval(interval: string): KlineIntervalV3 {
    // Check if interval is in valid intervals
    if (!VALID_INTERVALS.includes(interval as KlineIntervalV3)) {
      throw new Error(
        `Invalid interval: ${interval}. Valid intervals are: ${VALID_INTERVALS.join(', ')}`,
      );
    }

    return SUPPORTED_INTERVALS[interval].klineInterval;
  }

  private async updateSubscriptions() {
    try {
      const subscriptions =
        await this.subscriptionsService.getAllActiveSubscriptions();
      const uniquePairs = new Set<string>();

      // Get unique symbol-interval pairs
      for (const sub of subscriptions) {
        const validInterval = this.validateInterval(sub.interval);
        uniquePairs.add(`${sub.symbol}-${validInterval}`);
      }

      // Find pairs to unsubscribe and subscribe
      const pairsToUnsubscribe = Array.from(this.activeSubscriptions).filter(
        (pair) => !uniquePairs.has(pair),
      );
      const pairsToSubscribe = Array.from(uniquePairs).filter(
        (pair) => !this.activeSubscriptions.has(pair),
      );

      // Unsubscribe from pairs that are no longer needed
      for (const pair of pairsToUnsubscribe) {
        const [symbol, interval] = pair.split('-');

        const wsKlineTopicEvent = `kline.${interval}.${symbol}`;
        this.ws.unsubscribeV5(wsKlineTopicEvent, 'linear');
        this.activeSubscriptions.delete(pair);
        this.symbolData.delete(pair);
        console.log(`Unsubscribed from ${symbol} ${interval}`);
      }

      // Subscribe to new pairs
      for (const pair of pairsToSubscribe) {
        const [symbol, interval] = pair.split('-');
        const validInterval = this.validateInterval(`${interval}m`);

        // Fetch candles before subscribing
        const { candles, smoothedSMA } =
          await this.bybitService.fetchCandlesWithoutLast(
            symbol,
            validInterval,
            limit,
          );

        this.symbolData.set(pair, {
          symbol,
          interval: validInterval,
          candles,
          smaVolumes: smoothedSMA !== null ? [smoothedSMA] : [],
          prevHistogramAbs: 0,
        });

        // Subscribe to WebSocket after data is initialized
        const wsKlineTopicEvent = `kline.${validInterval}.${symbol}`;
        this.ws.subscribeV5(wsKlineTopicEvent, 'linear');
        this.activeSubscriptions.add(pair);
        console.log(`Subscribed to ${symbol} ${validInterval}`);
      }
    } catch (error) {
      console.error('Error updating subscriptions:', error);
    }
  }

  async handleSubscriptionChange() {
    await this.updateSubscriptions();
  }

  @Cron(CronExpression.EVERY_4_HOURS)
  private async updateTopVolumeCoins() {
    try {
      const newTopCoins = await this.bybitService.getTopVolumeCoins(
        this.TOP_VOLUME_COINS_COUNT,
      );
      if (newTopCoins.length === 0) {
        console.error(
          'Не удалось получить новый список монет для отслеживания',
        );
        return;
      }

      // Get current subscriptions for the channel
      const channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID');
      if (!channelId) {
        throw new Error('TELEGRAM_CHANNEL_ID not configured');
      }

      const currentSubscriptions =
        await this.subscriptionsService.getUserSubscriptions(channelId);
      const currentSymbols = currentSubscriptions.map((sub) => sub.symbol);

      // Deactivate all current subscriptions first
      for (const subscription of currentSubscriptions) {
        await this.subscriptionsService.deactivateSubscription(
          channelId,
          subscription.symbol,
          subscription.interval,
        );
      }

      // Create or activate subscriptions only for the top volume coins (limited by TOP_VOLUME_COINS_COUNT)
      for (const symbol of newTopCoins.slice(0, this.TOP_VOLUME_COINS_COUNT)) {
        await this.subscriptionsService.createOrUpdateSubscription(
          channelId,
          symbol,
          this.INTERVAL,
        );
      }

      // Log changes
      const addedSymbols = newTopCoins
        .slice(0, this.TOP_VOLUME_COINS_COUNT)
        .filter((symbol) => !currentSymbols.includes(symbol));
      const removedSymbols = currentSymbols.filter(
        (symbol) =>
          !newTopCoins.slice(0, this.TOP_VOLUME_COINS_COUNT).includes(symbol),
      );

      console.log('Обновлен список отслеживаемых монет:');
      console.log(
        'Добавлены:',
        addedSymbols.map((symbol) => `${symbol} ${this.INTERVAL}`),
      );
      console.log(
        'Удалены:',
        removedSymbols.map((symbol) => `${symbol} ${this.INTERVAL}`),
      );
    } catch (error) {
      console.error('Ошибка при обновлении списка монет:', error);
      await this.telegramService.sendErrorNotification({
        error,
        context: 'Ошибка при обновлении списка монет',
        userId: this.channelId,
      });
    }
  }

  private async startBot() {
    try {
      // Получаем начальный список монет
      await this.updateTopVolumeCoins();

      this.ws.on('open', () => {
        console.log('WebSocket подключен к Bybit.');
      });

      this.ws.on('close', () => {
        this.telegramService.sendNotification(
          'error',
          'WebSocket отключился.',
          this.channelId,
        );
      });

      this.ws.on('error', ((error: any) => {
        this.telegramService.sendNotification(
          'error',
          `WebSocket ошибка: ${error}`,
          this.channelId,
        );
      }) as unknown as never);

      this.ws.on('reconnect', () => {
        console.log('WebSocket reconnecting...');
      });

      this.ws.on('reconnected', () => {
        console.log('WebSocket reconnected');
      });

      this.ws.on(
        'update',
        async (data: { topic: string; data: WsKlineV5[] }) => {
          if (!data.topic || !data.data) return;
          const [_, interval, symbol] = data.topic.split('.');
          const pairKey = `${symbol}-${interval}`;
          const symbolData = this.symbolData.get(pairKey);
          if (!symbolData) return;

          const klineArray = data.data;
          const latestKline = klineArray[0];
          if (!latestKline) return;

          const close = parseFloat(latestKline.close);
          const high = parseFloat(latestKline.high);
          const low = parseFloat(latestKline.low);
          const isClosed = latestKline.confirm;
          if (!isClosed) return;

          const startTime = dayjs(latestKline.start).format('YY-MM-DD HH:mm');
          console.log(
            `${symbol} ${interval}: Новая закрытая свеча: ${startTime}, close=${close}, high=${high}, low=${low}`,
          );

          // Check for profit on active signals using high and low prices
          await this.signalsService.checkSignalProfit({
            symbol,
            interval,
            currentPrice: close,
            highPrice: high,
            lowPrice: low,
            profitConfig: this.getProfitConfig(`${interval}m`),
          });

          symbolData.candles.push({
            startTime: latestKline.start.toString(),
            openPrice: latestKline.open,
            highPrice: latestKline.high,
            lowPrice: latestKline.low,
            closePrice: latestKline.close,
            volume: latestKline.volume,
            turnover: latestKline.turnover,
          });

          const closingPrices = symbolData.candles.map((item) =>
            parseFloat(item.closePrice),
          );
          const { histogram, macdLine, signalLine } = calculateMACD(
            closingPrices.reverse(),
            Number(this.FAST_PERIOD),
            Number(this.SLOW_PERIOD),
            Number(this.SIGNAL_PERIOD),
          );

          if (histogram.length) {
            const latestHist = histogram[histogram.length - 1];
            console.log(
              `${symbol} ${interval}: [ws update] MACD hist=${latestHist.toFixed(6)}, closePrice=${symbolData.candles[histogram.length - 1].closePrice}, closeTime=${symbolData.candles[histogram.length - 1].startTime}, (fast=${macdLine[macdLine.length - 1].toFixed(6)}, signal=${signalLine[signalLine.length - 1].toFixed(6)})`,
            );

            const smoothedSMA = calculateSmoothedSMA(
              symbolData.candles.map(({ volume }) => parseFloat(volume)),
              Number(this.VOLUME_SMA_SMOOTHING_PERIOD),
            );

            if (smoothedSMA !== null) {
              symbolData.smaVolumes.push(smoothedSMA);
            }

            const currentSmoothedSmaVolume =
              symbolData.smaVolumes[symbolData.smaVolumes.length - 1];
            const previousSmoothedSmaVolume =
              symbolData.smaVolumes[symbolData.smaVolumes.length - 2];
            const currentVolume = parseFloat(
              symbolData.candles[symbolData.candles.length - 1].volume,
            );
            const previousVolume = parseFloat(
              symbolData.candles[symbolData.candles.length - 2].volume,
            );
            const increaseVolumePercent =
              ((currentVolume - previousVolume) / previousVolume) * 100;

            const openPositionCondition =
              (increaseVolumePercent > 10 &&
                currentSmoothedSmaVolume > previousSmoothedSmaVolume) ||
              increaseVolumePercent > 60;

            this.handleMacdSignal(
              symbol,
              interval,
              latestHist,
              openPositionCondition,
              histogram,
              pairKey,
            ).catch((error) => {
              console.error(
                `Error handling MACD signal for ${symbol} ${interval}:`,
                error,
              );
            });
          }
        },
      );

      await this.telegramService.sendInfoNotification(
        'Статус бота',
        'Бот запущен и ожидает новые свечи\\.',
        this.channelId,
      );
    } catch (error) {
      await this.telegramService.sendErrorNotification({
        userId: this.channelId,
        context: 'Ошибка при запуске бота',
        error,
      });
    }
  }

  private async handleMacdSignal(
    symbol: string,
    interval: string,
    histogramValue: number,
    canOpenPositionByVolume: boolean,
    macdHistogram: number[],
    pairKey: string,
  ) {
    const symbolData = this.symbolData.get(pairKey);
    if (!symbolData) return;

    const currentHistogramAbs = Math.abs(histogramValue);
    const currentSign = Math.sign(histogramValue);

    console.log(
      `${symbol} ${interval}: [handleMacdSignal] Current histogram value: ${histogramValue.toFixed(6)}, sign: ${currentSign}`,
    );

    if (macdHistogram.length < this.ONE_HISTOGRAM_DIRECTION_CANDLES) {
      console.log(
        `${symbol} ${interval}: [handleMacdSignal] Недостаточно свечей для проверки MACD направления. Требуется минимум ${this.ONE_HISTOGRAM_DIRECTION_CANDLES} свечей.`,
      );
      return;
    }
    const lastCandles = macdHistogram.slice(
      -this.ONE_HISTOGRAM_DIRECTION_CANDLES,
    );
    const allSame = lastCandles.every(
      (value) => Math.sign(value) === currentSign,
    );
    console.log(
      `${symbol} ${interval}: [handleMacdSignal] Last ${this.ONE_HISTOGRAM_DIRECTION_CANDLES} candles signs:`,
      lastCandles.map((v) => Math.sign(v)),
    );
    if (!allSame) {
      console.log(
        `${symbol} ${interval}: [handleMacdSignal] Последние ${this.ONE_HISTOGRAM_DIRECTION_CANDLES} свечей не подтверждают единое направление MACD.`,
      );
      return;
    }

    // Проверяем ослабление сигнала: если абсолютное значение MACD не снизилось
    if (currentHistogramAbs >= symbolData.prevHistogramAbs) {
      console.log(
        `${symbol} ${interval}: [handleMacdSignal] Абсолютное значение MACD не снизилось. Current: ${currentHistogramAbs.toFixed(6)}, Previous: ${symbolData.prevHistogramAbs.toFixed(6)}`,
      );
      symbolData.prevHistogramAbs = currentHistogramAbs;
      return;
    }

    if (canOpenPositionByVolume) {
      const higherInterval = HIGHER_TIMEFRAME_MAP[`${interval}m`];
      if (!higherInterval) {
        console.log(
          `${symbol} ${interval}: No higher timeframe mapping available for interval ${interval}`,
        );
        return;
      }

      const { candles: higherTimeframeCandles } =
        await this.bybitService.fetchCandlesWithoutLast(
          symbol,
          higherInterval,
          limit,
        );

      if (!higherTimeframeCandles || higherTimeframeCandles.length === 0) {
        console.log(
          `${symbol} ${interval}: No higher timeframe data available`,
        );
        return;
      }

      const higherTimeframeMACD = calculateMACD(
        higherTimeframeCandles.map((item) => parseFloat(item.closePrice)),
        Number(this.FAST_PERIOD),
        Number(this.SLOW_PERIOD),
        Number(this.SIGNAL_PERIOD),
      );

      if (higherTimeframeMACD.histogram.length === 0) {
        console.log(
          `${symbol} ${interval}: No MACD data available for higher timeframe`,
        );
        return;
      }

      const higherTimeframeHistogram =
        higherTimeframeMACD.histogram[higherTimeframeMACD.histogram.length - 2];
      const higherTimeframePrevHistogram =
        higherTimeframeMACD.histogram[higherTimeframeMACD.histogram.length - 3];
      const higherTimeframeAbsStartedToDown =
        Math.abs(higherTimeframeHistogram) <
        Math.abs(higherTimeframePrevHistogram);

      console.log(`${symbol} ${interval}: [handleMacdSignal] Higher timeframe analysis:
        Current histogram: ${higherTimeframeHistogram.toFixed(6)}
        Previous histogram: ${higherTimeframePrevHistogram.toFixed(6)}
        Started to down: ${higherTimeframeAbsStartedToDown}
        Current sign: ${currentSign}
        Higher timeframe sign: ${Math.sign(higherTimeframeHistogram)}`);

      const isShortSignal =
        histogramValue > 0 &&
        (higherTimeframeHistogram < 0 ||
          (higherTimeframeHistogram > 0 && higherTimeframeAbsStartedToDown));

      const isLongSignal =
        histogramValue < 0 &&
        (higherTimeframeHistogram > 0 ||
          (higherTimeframeHistogram < 0 && higherTimeframeAbsStartedToDown));

      console.log(`${symbol} ${interval}: [handleMacdSignal] Signal conditions:
        Is short signal: ${isShortSignal}
        Is long signal: ${isLongSignal}
        Can open position by volume: ${canOpenPositionByVolume}`);

      const { closePrice: currentClosePrice } =
        symbolData.candles[symbolData.candles.length - 1];

      if (isLongSignal || isShortSignal) {
        const currentPrice = parseFloat(currentClosePrice);
        const config = this.getProfitConfig(`${interval}m`);

        // Get all users subscribed to this symbol-interval pair
        const subscriberIds =
          await this.subscriptionsService.getSubscribersIdsForPair(
            symbol,
            interval,
          );

        console.log(subscriberIds, 'subscriberIds');

        // Create and send signal for each subscriber
        for (const userId of subscriberIds) {
          const signal = new Signal();
          signal.symbol = symbol;
          signal.interval = interval;
          signal.entryPrice = currentPrice;
          signal.type = isLongSignal ? 'long' : 'short';
          signal.status = 'active';
          signal.takeProfit = currentPrice * (1 + config.profit / 100);
          signal.userId = userId;

          await this.signalsService.createSignal(signal, userId);
        }
      } else {
        console.log(
          `${symbol} ${interval}: [handleMacdSignal] Нет сигнала для открытия позиции. MACD малого таймфрейма: ${currentSign}, MACD большого таймфрейма: ${higherTimeframeHistogram.toFixed(6)}`,
        );
      }
    }
  }

  // Get profit/validity config for current timeframe
  private getProfitConfig(interval: string): {
    profit: number;
    validityHours: number;
  } {
    return SUPPORTED_INTERVALS[interval] || { profit: 1, validityHours: 24 };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  private async cleanupOldSignals() {
    try {
      // Get signal statistics
      const stats = await this.signalsService.getSignalStats(this.channelId);

      // Format the daily report
      const reportHeader = '<b>📊 Ежедневный отчет по сигналам</b>';
      let reportContent = '';

      const { totalSignals, profitableSignals } = stats;
      const overallSuccessRate =
        totalSignals > 0
          ? ((profitableSignals / totalSignals) * 100).toFixed(2)
          : '0.00';

      // Add overall statistics to report
      reportContent +=
        `Общая статистика:\n` +
        `Всего сигналов: ${totalSignals}\n` +
        `Успешных: ${profitableSignals}\n` +
        `Процент успеха: ${overallSuccessRate}%\n`;

      // Send the report
      await this.telegramService.sendInfoNotification(
        reportHeader,
        reportContent,
        this.channelId,
      );

      // Cleanup old signals (keep last 30 days)
      await this.signalsService.cleanupOldSignals(3);
    } catch (error) {
      await this.telegramService.sendErrorNotification({
        userId: this.channelId,
        error,
        context: 'Ошибка при формировании ежедневного отчета',
      });
    }
  }
}
