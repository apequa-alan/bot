import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dayjs from 'dayjs';
import { WebsocketClient, KlineIntervalV3 } from 'bybit-api';
import { TelegramService } from '../telegram/telegram.service';
import { BybitService } from '../bybit/bybit.service';
import { calculateMACD } from './utils/macd.utils';
import { calculateSmoothedSMA } from './utils/sma.utils';
import {
  SymbolData,
  WsKlineV5,
  Signal,
  SignalStats,
  ProfitStopConfig,
} from './types';
import { Cron, CronExpression } from '@nestjs/schedule';
import { parseNumber } from '../utils/number';

const limit = 300;
@Injectable()
export class TradingBotService implements OnModuleInit {
  private ws: WebsocketClient;
  private symbolData: Map<string, SymbolData> = new Map();
  private readonly TOP_VOLUME_COINS_COUNT = 10;
  private readonly ONE_HISTOGRAM_DIRECTION_CANDLES = 5;
  private activeSignals: Signal[] = [];

  // Configure profit and stop limit values for each timeframe
  private readonly TIMEFRAME_CONFIG: Partial<
    Record<KlineIntervalV3, ProfitStopConfig>
  > = {
    '1': { profit: 0.6, stop: 0.4 },
    '3': { profit: 0.8, stop: 0.65 },
    '5': { profit: 1, stop: 0.7 },
    '15': { profit: 1.5, stop: 0.9 },
    '30': { profit: 2, stop: 1.2 },
    '60': { profit: 2.5, stop: 1.5 },
    '120': { profit: 3, stop: 1.8 },
    '240': { profit: 3.5, stop: 2 },
    '360': { profit: 4, stop: 2.5 },
    D: { profit: 5, stop: 3 },
    W: { profit: 8, stop: 5 },
    M: { profit: 10, stop: 6 },
  };

  private readonly BYBIT_API_KEY: string;
  private readonly BYBIT_API_SECRET: string;
  private readonly INTERVAL: KlineIntervalV3;
  private readonly FAST_PERIOD: string;
  private readonly SLOW_PERIOD: string;
  private readonly SIGNAL_PERIOD: string;
  private readonly VOLUME_SMA_SMOOTHING_PERIOD: string;

  private readonly HIGHER_TIMEFRAME_MAP: Partial<
    Record<KlineIntervalV3, KlineIntervalV3>
  > = {
    '1': '5',
    '3': '15',
    '5': '15',
    '15': '60',
    '30': '120',
    '60': '240',
    '120': '240',
    '240': 'D',
    '360': 'D',
    D: 'W',
    W: 'M',
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly telegramService: TelegramService,
    private readonly bybitService: BybitService,
  ) {
    this.BYBIT_API_KEY = this.configService.get<string>('BYBIT_API_KEY') ?? '';
    this.BYBIT_API_SECRET =
      this.configService.get<string>('BYBIT_API_SECRET') ?? '';
    this.INTERVAL = this.configService.get<string>(
      'INTERVAL',
      '1',
    ) as KlineIntervalV3;
    this.FAST_PERIOD = this.configService.get<string>('FAST_PERIOD', '12');
    this.SLOW_PERIOD = this.configService.get<string>('SLOW_PERIOD', '26');
    this.SIGNAL_PERIOD = this.configService.get<string>('SIGNAL_PERIOD', '9');
    this.VOLUME_SMA_SMOOTHING_PERIOD = this.configService.get<string>(
      'VOLUME_SMA_SMOOTHING_PERIOD',
      '9',
    );
  }

  async onModuleInit() {
    this.ws = new WebsocketClient({
      market: 'v5',
      key: this.BYBIT_API_KEY,
      secret: this.BYBIT_API_SECRET,
    });

    await this.startBot();
  }

  @Cron(CronExpression.EVERY_4_HOURS)
  private async updateTopVolumeCoins() {
    try {
      const newTopCoins = await this.bybitService.getTopVolumeCoins(
        this.TOP_VOLUME_COINS_COUNT,
      );
      if (newTopCoins.length === 0) {
        this.telegramService.sendNotification(
          'error',
          'Не удалось получить новый список монет для отслеживания',
        );
        return;
      }

      const currentCoins = Array.from(this.symbolData.keys());

      const coinsToAdd = newTopCoins.filter(
        (coin) => !currentCoins.includes(coin),
      );
      const coinsToRemove = currentCoins.filter(
        (coin) => !newTopCoins.includes(coin),
      );

      for (const symbol of coinsToRemove) {
        const wsKlineTopicEvent = `kline.${this.INTERVAL}.${symbol}`;
        this.ws.unsubscribeV5(wsKlineTopicEvent, 'linear');
        this.symbolData.delete(symbol);
        console.log(`Прекращено отслеживание ${symbol}`);
      }

      for (const symbol of coinsToAdd) {
        const { candles, smoothedSMA } =
          await this.bybitService.fetchCandlesWithoutLast(
            symbol,
            this.INTERVAL,
            limit,
          );

        this.symbolData.set(symbol, {
          symbol,
          candles,
          smaVolumes: smoothedSMA !== null ? [smoothedSMA] : [],
          prevHistogramAbs: 0,
        });

        const wsKlineTopicEvent = `kline.${this.INTERVAL}.${symbol}`;
        this.ws.subscribeV5(wsKlineTopicEvent, 'linear');
        console.log(`Начато отслеживание ${symbol}`);
      }

      await this.telegramService.sendNotification(
        'info',
        `Обновлен список отслеживаемых монет:\n` +
          `Добавлены: ${coinsToAdd.join(', ') || 'нет'}\n` +
          `Удалены: ${coinsToRemove.join(', ') || 'нет'}`,
      );
    } catch (error) {
      await this.telegramService.sendNotification(
        'error',
        `Ошибка при обновлении списка монет: ${error}`,
      );
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
        this.telegramService.sendNotification('error', 'WebSocket отключился.');
      });

      this.ws.on('error', ((error: any) => {
        this.telegramService.sendNotification(
          'error',
          `WebSocket ошибка: ${error}`,
        );
      }) as unknown as never);

      this.ws.on('reconnect', () => {
        console.log('WebSocket reconnecting...');
      });

      this.ws.on('reconnected', () => {
        console.log('WebSocket reconnected');
      });

      this.ws.on('update', (data: { topic: string; data: WsKlineV5[] }) => {
        if (!data.topic || !data.data) return;

        const symbol = data.topic.split('.')[2];
        const symbolData = this.symbolData.get(symbol);
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
          `${symbol}: Новая закрытая свеча: ${startTime}, close=${close}, high=${high}, low=${low}`,
        );

        // Check for profit on active signals using high and low prices
        this.checkSignalProfit(symbol, close, high, low);

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
        console.log('symbol', symbol);
        console.log(JSON.stringify(closingPrices.reverse()));
        console.log(JSON.stringify(histogram));
        console.log('symbol END ======', symbol);

        if (histogram.length) {
          const latestHist = histogram[histogram.length - 1];
          console.log(
            `${symbol}: [ws update] MACD hist=${latestHist.toFixed(6)}, closePrice=${symbolData.candles[histogram.length - 1].closePrice}, closeTime=${symbolData.candles[histogram.length - 1].startTime}, (fast=${macdLine[macdLine.length - 1].toFixed(6)}, signal=${signalLine[signalLine.length - 1].toFixed(6)})`,
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
            latestHist,
            openPositionCondition,
            histogram,
          ).catch((error) => {
            console.error(`Error handling MACD signal for ${symbol}:`, error);
          });
        }
      });

      this.telegramService.sendNotification(
        'info',
        'Бот запущен и ожидает новые свечи.',
      );
    } catch (error) {
      this.telegramService.sendNotification(
        'error',
        `Ошибка при запуске бота: ${error}`,
      );
    }
  }

  private async handleMacdSignal(
    symbol: string,
    histogramValue: number,
    canOpenPositionByVolume: boolean,
    macdHistogram: number[],
  ) {
    const symbolData = this.symbolData.get(symbol);
    if (!symbolData) return;

    // Check if symbol already has an active signal - if so, don't generate a new one
    if (this.hasActiveSignal(symbol)) {
      console.log(`${symbol}: Уже есть активный сигнал, новый не генерируется`);
      return;
    }

    const currentHistogramAbs = Math.abs(histogramValue);
    const currentSign = Math.sign(histogramValue);

    if (macdHistogram.length < this.ONE_HISTOGRAM_DIRECTION_CANDLES) {
      console.log(
        `${symbol}: [handleMacdSignal] Недостаточно свечей для проверки MACD направления. Требуется минимум ${this.ONE_HISTOGRAM_DIRECTION_CANDLES} свечей.`,
      );
      return;
    }
    const lastCandles = macdHistogram.slice(
      -this.ONE_HISTOGRAM_DIRECTION_CANDLES,
    );
    const allSame = lastCandles.every(
      (value) => Math.sign(value) === currentSign,
    );
    if (!allSame) {
      console.log(
        `${symbol}: [handleMacdSignal] Последние ${this.ONE_HISTOGRAM_DIRECTION_CANDLES} свечей не подтверждают единое направление MACD.`,
      );
      return;
    }

    // Проверяем ослабление сигнала: если абсолютное значение MACD не снизилось
    if (currentHistogramAbs >= symbolData.prevHistogramAbs) {
      console.log(
        `${symbol}: [handleMacdSignal] Абсолютное значение MACD не снизилось.`,
      );
      symbolData.prevHistogramAbs = currentHistogramAbs;
      return;
    }

    if (canOpenPositionByVolume) {
      const higherInterval = this.HIGHER_TIMEFRAME_MAP[this.INTERVAL];
      if (!higherInterval) {
        console.log(
          `${symbol}: No higher timeframe mapping available for interval ${this.INTERVAL}`,
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
        console.log(`${symbol}: No higher timeframe data available`);
        return;
      }

      const higherTimeframeMACD = calculateMACD(
        higherTimeframeCandles.map((item) => parseFloat(item.closePrice)),
        Number(this.FAST_PERIOD),
        Number(this.SLOW_PERIOD),
        Number(this.SIGNAL_PERIOD),
      );

      if (higherTimeframeMACD.histogram.length === 0) {
        console.log(`${symbol}: No MACD data available for higher timeframe`);
        return;
      }

      const higherTimeframeHistogram =
        higherTimeframeMACD.histogram[higherTimeframeMACD.histogram.length - 2];
      const higherTimeframePrevHistogram =
        higherTimeframeMACD.histogram[higherTimeframeMACD.histogram.length - 3];
      const higherTimeframeAbsStartedToDown =
        Math.abs(higherTimeframeHistogram) <
        Math.abs(higherTimeframePrevHistogram);

      const isShortSignal =
        histogramValue > 0 &&
        (higherTimeframeHistogram < 0 ||
          (higherTimeframeHistogram > 0 && higherTimeframeAbsStartedToDown));

      const isLongSignal =
        histogramValue < 0 &&
        (higherTimeframeHistogram > 0 ||
          (higherTimeframeHistogram < 0 && higherTimeframeAbsStartedToDown));

      const { closePrice: currentClosePrice } =
        symbolData.candles[symbolData.candles.length - 1];

      if (isLongSignal || isShortSignal) {
        const currentPrice = parseFloat(currentClosePrice);
        const currentTime =
          symbolData.candles[symbolData.candles.length - 1].startTime;

        const signalMessage =
          `${symbol} ${isLongSignal ? '📈 Сигнал на открытие лонга' : '📉 Сигнал на открытие шорта'}\n` +
          `Цена: ${parseNumber(Number(currentClosePrice))}\n` +
          `MACD: ${histogramValue.toFixed(6)}\n` +
          `MACD (${higherInterval}m) prev: ${higherTimeframePrevHistogram.toFixed(6)}\n` +
          `TP: ${this.getProfitStopConfig().profit}%, SL: ${this.getProfitStopConfig().stop}%`;

        // Send signal notification and get message ID
        const messageId = await this.telegramService.sendNotification(
          'info',
          signalMessage,
        );

        // Add to active signals with message ID
        this.activeSignals.push({
          symbol,
          entryPrice: currentPrice,
          entryTime: currentTime,
          type: isLongSignal ? 'long' : 'short',
          active: true,
          maxProfit: 0,
          notified: false,
          messageId, // Store the message ID for future replies
          status: 'active', // Add status field
        });
      } else {
        console.log(
          `${symbol}: [handleMacdSignal] Нет сигнала для открытия позиции. MACD малого таймфрейма: ${currentSign}, MACD большого таймфрейма: ${higherTimeframeHistogram.toFixed(6)}`,
        );
      }
    }
  }

  // Check if symbol already has an active signal
  private hasActiveSignal(symbol: string): boolean {
    return this.activeSignals.some(
      (signal) => signal.symbol === symbol && signal.active,
    );
  }

  // Get profit/stop config for current timeframe
  private getProfitStopConfig(): ProfitStopConfig {
    return this.TIMEFRAME_CONFIG[this.INTERVAL] || { profit: 1, stop: 0.6 };
  }

  // Update checkSignalProfit method to use high/low prices
  private checkSignalProfit(
    symbol: string,
    currentPrice: number,
    highPrice: number,
    lowPrice: number,
  ): void {
    // Find active signals for this symbol
    const symbolSignals = this.activeSignals.filter(
      (signal) => signal.symbol === symbol && signal.active,
    );

    if (!symbolSignals.length) return;

    const config = this.getProfitStopConfig();

    for (const signal of symbolSignals) {
      let profitPercent = 0;
      let maxPossibleProfitPercent = 0;

      // Calculate profit based on position type
      if (signal.type === 'long') {
        // For long positions, use close price for current profit
        profitPercent =
          ((currentPrice - signal.entryPrice) / signal.entryPrice) * 100;
        // For long positions, use high price for max possible profit
        maxPossibleProfitPercent =
          ((highPrice - signal.entryPrice) / signal.entryPrice) * 100;
      } else if (signal.type === 'short') {
        // For short positions, use close price for current profit
        profitPercent =
          ((signal.entryPrice - currentPrice) / signal.entryPrice) * 100;
        // For short positions, use low price for max possible profit
        maxPossibleProfitPercent =
          ((signal.entryPrice - lowPrice) / signal.entryPrice) * 100;
      }

      // Update max profit if the max possible profit is higher
      if (maxPossibleProfitPercent > signal.maxProfit) {
        signal.maxProfit = maxPossibleProfitPercent;
      }

      // Send notification if max profit exceeds threshold and hasn't been notified yet
      if (signal.maxProfit >= config.profit && !signal.notified) {
        signal.notified = true;
        signal.status = 'success'; // Mark as success when profit target is hit

        const profitMessage =
          `${symbol} 💰 Прибыль по сигналу!\n` +
          `Тип: ${signal.type === 'long' ? 'Лонг' : 'Шорт'}\n` +
          `Вход: ${signal.entryPrice}\n` +
          `Текущая цена: ${currentPrice}\n` +
          `Макс. цена: ${signal.type === 'long' ? highPrice : lowPrice}\n` +
          `Макс. прибыль: ${signal.maxProfit.toFixed(2)}%\n` +
          `Текущая прибыль: ${profitPercent.toFixed(2)}%`;

        // Send as reply to original signal
        this.telegramService.sendReplyNotification(
          'fix',
          profitMessage,
          signal.messageId,
        );
      }

      // Close signal if stop reached
      if (profitPercent <= -config.stop) {
        signal.active = false;
        signal.status = 'stopped'; // Mark as stopped when stop loss is hit

        const stopLossMessage =
          `${symbol} 🔴 Стоп-лосс по сигналу\n` +
          `Тип: ${signal.type === 'long' ? 'Лонг' : 'Шорт'}\n` +
          `Вход: ${signal.entryPrice}\n` +
          `Текущая цена: ${currentPrice}\n` +
          `Убыток: ${profitPercent.toFixed(2)}%`;

        // Send as reply to original signal
        this.telegramService.sendReplyNotification(
          'error',
          stopLossMessage,
          signal.messageId,
        );
      }

      // Close signal if current profit is negative after reaching profit threshold
      if (signal.maxProfit >= config.profit && profitPercent < 0) {
        signal.active = false;
        signal.status = 'failure'; // Mark as failure when it reverses after hitting profit

        const closedMessage =
          `${symbol} ⚠️ Сигнал закрыт после разворота\n` +
          `Тип: ${signal.type === 'long' ? 'Лонг' : 'Шорт'}\n` +
          `Вход: ${signal.entryPrice}\n` +
          `Текущая цена: ${currentPrice}\n` +
          `Макс. прибыль: ${signal.maxProfit.toFixed(2)}%\n` +
          `Текущая прибыль: ${profitPercent.toFixed(2)}%`;

        // Send as reply to original signal
        this.telegramService.sendReplyNotification(
          'info',
          closedMessage,
          signal.messageId,
        );
      }
    }
  }

  // Add method to generate daily statistics
  private generateSignalStatistics(): SignalStats[] {
    const stats: Record<string, SignalStats> = {};
    const dayStart = dayjs().startOf('day').valueOf();

    // Consider only signals from the current day
    const dailySignals = this.activeSignals.filter(
      (signal) => dayjs(signal.entryTime).valueOf() >= dayStart,
    );

    // Initialize stats object for each symbol
    for (const signal of dailySignals) {
      if (!stats[signal.symbol]) {
        stats[signal.symbol] = {
          symbol: signal.symbol,
          success: 0,
          failure: 0,
          stopped: 0,
          total: 0,
          successRate: 0,
          failureRate: 0,
        };
      }

      // Count by status
      stats[signal.symbol].total++;

      if (signal.status === 'success') {
        stats[signal.symbol].success++;
      } else if (signal.status === 'failure') {
        stats[signal.symbol].failure++;
      } else if (signal.status === 'stopped') {
        stats[signal.symbol].stopped++;
      }
    }

    // Calculate rates
    Object.values(stats).forEach((stat) => {
      stat.successRate = stat.total > 0 ? (stat.success / stat.total) * 100 : 0;
      stat.failureRate = stat.total > 0 ? (stat.failure / stat.total) * 100 : 0;
    });

    return Object.values(stats);
  }

  // Add method to send daily report at end of day
  @Cron('0 0 23 * * *') // Run at 23:00 every day
  private async sendDailyReport() {
    try {
      const stats = this.generateSignalStatistics();

      if (stats.length === 0) {
        await this.telegramService.sendNotification(
          'info',
          'Ежедневный отчет: нет сигналов за сегодня\\.',
        );
        return;
      }

      // Sort by success rate for finding best/worst performers
      const sortedBySuccessRate = [...stats].sort(
        (a, b) => b.successRate - a.successRate,
      );
      const sortedByFailureRate = [...stats].sort(
        (a, b) => b.failureRate - a.failureRate,
      );

      // Best and worst performers with null checks
      const bestSymbol =
        sortedBySuccessRate.length > 0 ? sortedBySuccessRate[0] : null;
      const worstSymbol =
        sortedBySuccessRate.length > 0
          ? sortedBySuccessRate[sortedBySuccessRate.length - 1]
          : null;
      const highestFailureSymbol =
        sortedByFailureRate.length > 0 ? sortedByFailureRate[0] : null;
      const lowestFailureSymbol =
        sortedByFailureRate.length > 0
          ? sortedByFailureRate[sortedByFailureRate.length - 1]
          : null;

      // Build report message with MarkdownV2 formatting
      // Note: In MarkdownV2, special characters must be escaped with a backslash: _*[]()~`>#+-=|{}.!
      let reportMessage = '📊 *Ежедневный отчет по сигналам* 📊\n\n';

      reportMessage += '*Статистика по символам:*\n';
      stats.forEach((stat) => {
        const escapedSymbol = stat.symbol.replace(
          /([_*[\]()~`>#+=|{}.!])/g,
          '\\$1',
        );
        reportMessage += `${escapedSymbol}: ✅ ${stat.success}, ❌ ${stat.failure}, 🛑 ${stat.stopped} \\(Всего: ${stat.total}\\)\n`;
      });

      reportMessage += '\n*Лучшие и худшие результаты:*\n';

      if (bestSymbol) {
        const escapedSymbol = bestSymbol.symbol.replace(
          /([_*[\]()~`>#+=|{}.!])/g,
          '\\$1',
        );
        const successRate =
          typeof bestSymbol.successRate === 'number'
            ? bestSymbol.successRate
            : 0;
        reportMessage += `✅ Наибольший % успеха: ${escapedSymbol} \\(${successRate.toFixed(2)}%\\)\n`;
      }

      if (worstSymbol) {
        const escapedSymbol = worstSymbol.symbol.replace(
          /([_*[\]()~`>#+=|{}.!])/g,
          '\\$1',
        );
        const successRate =
          typeof worstSymbol.successRate === 'number'
            ? worstSymbol.successRate
            : 0;
        reportMessage += `✅ Наименьший % успеха: ${escapedSymbol} \\(${successRate.toFixed(2)}%\\)\n`;
      }

      if (highestFailureSymbol) {
        const escapedSymbol = highestFailureSymbol.symbol.replace(
          /([_*[\]()~`>#+=|{}.!])/g,
          '\\$1',
        );
        const failureRate =
          typeof highestFailureSymbol.failureRate === 'number'
            ? highestFailureSymbol.failureRate
            : 0;
        reportMessage += `❌ Наибольший % неудач: ${escapedSymbol} \\(${failureRate.toFixed(2)}%\\)\n`;
      }

      if (lowestFailureSymbol) {
        const escapedSymbol = lowestFailureSymbol.symbol.replace(
          /([_*[\]()~`>#+=|{}.!])/g,
          '\\$1',
        );
        const failureRate =
          typeof lowestFailureSymbol.failureRate === 'number'
            ? lowestFailureSymbol.failureRate
            : 0;
        reportMessage += `❌ Наименьший % неудач: ${escapedSymbol} \\(${failureRate.toFixed(2)}%\\)\n`;
      }

      await this.telegramService.sendNotification('info', reportMessage);
    } catch (error) {
      await this.telegramService.sendNotification(
        'error',
        `Ошибка при генерации ежедневного отчета: ${error instanceof Error ? error.message.replace(/([_*[\]()~`>#+=|{}.!])/g, '\\$1') : String(error).replace(/([_*[\]()~`>#+=|{}.!])/g, '\\$1')}`,
      );
    }
  }

  // Add cleanup method to prevent memory leaks
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  private cleanupOldSignals() {
    // Keep only active signals or signals created in the last 7 days
    const sevenDaysAgo = dayjs().subtract(7, 'day').valueOf();
    this.activeSignals = this.activeSignals.filter((signal) => {
      return signal.active || dayjs(signal.entryTime).valueOf() > sevenDaysAgo;
    });

    this.telegramService.sendNotification(
      'info',
      `Очистка старых сигналов завершена. Активных сигналов: ${this.activeSignals.filter((s) => s.active).length}`,
    );
  }
}
