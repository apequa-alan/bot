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
  TimeframeConfig,
} from './types';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SignalsService } from '../signals/signals.service';
import { Signal } from '../signals/entities/signal.entity';
import {
  formatNumberForMarkdown,
  formatPercentageForMarkdown,
  formatSymbolForMarkdown,
  formatHeaderForMarkdown,
} from '../telegram/telegram.utils';

const limit = 300;

@Injectable()
export class TradingBotService implements OnModuleInit {
  private ws: WebsocketClient;
  private symbolData: Map<string, SymbolData> = new Map();
  private readonly TOP_VOLUME_COINS_COUNT = 10;
  private readonly ONE_HISTOGRAM_DIRECTION_CANDLES = 5;

  // Configure profit and validity hours for each timeframe
  private readonly TIMEFRAME_CONFIG: Partial<
    Record<KlineIntervalV3, TimeframeConfig>
  > = {
    '1': { profit: 0.6, validityHours: 1 },
    '3': { profit: 0.8, validityHours: 1 },
    '5': { profit: 1, validityHours: 1 },
    '15': { profit: 1.5, validityHours: 2 },
    '30': { profit: 2, validityHours: 2 },
    '60': { profit: 2.5, validityHours: 4 },
    '120': { profit: 3, validityHours: 8 },
    '240': { profit: 3.5, validityHours: 16 },
    '360': { profit: 4, validityHours: 32 },
    D: { profit: 5, validityHours: 96 },
    W: { profit: 8, validityHours: 168 },
    M: { profit: 10, validityHours: 720 },
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
    private readonly signalsService: SignalsService,
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
        console.error('Не удалось получить новый список монет для отслеживания');
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

      // Log changes to console only
      console.log('Обновлен список отслеживаемых монет:');
      console.log('Добавлены:', coinsToAdd);
      console.log('Удалены:', coinsToRemove);
    } catch (error) {
      console.error('Ошибка при обновлении списка монет:', error);
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

      this.ws.on('update', async (data: { topic: string; data: WsKlineV5[] }) => {
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
        await this.signalsService.checkSignalProfit(
         {
          symbol,
          currentPrice: close,
          highPrice: high,
          lowPrice: low,
          profitConfig: this.getProfitConfig(),
         }
        );

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

      await this.telegramService.sendInfoNotification(
        'Статус бота',
        'Бот запущен и ожидает новые свечи\\.'
      );
    } catch (error) {
      await this.telegramService.sendErrorNotification(error, 'Ошибка при запуске бота');
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

    // Check if symbol already has an active signal
    const activeSignals = await this.signalsService.getActiveSignals();
    if (activeSignals.some(signal => signal.symbol === symbol && signal.status === 'active')) {
      console.log(`${symbol}: Уже есть активный сигнал, новый не генерируется`);
      return;
    }

    const currentHistogramAbs = Math.abs(histogramValue);
    const currentSign = Math.sign(histogramValue);

    console.log(`${symbol}: [handleMacdSignal] Current histogram value: ${histogramValue.toFixed(6)}, sign: ${currentSign}`);

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
    console.log(`${symbol}: [handleMacdSignal] Last ${this.ONE_HISTOGRAM_DIRECTION_CANDLES} candles signs:`, lastCandles.map(v => Math.sign(v)));
    if (!allSame) {
      console.log(
        `${symbol}: [handleMacdSignal] Последние ${this.ONE_HISTOGRAM_DIRECTION_CANDLES} свечей не подтверждают единое направление MACD.`,
      );
      return;
    }

    // Проверяем ослабление сигнала: если абсолютное значение MACD не снизилось
    if (currentHistogramAbs >= symbolData.prevHistogramAbs) {
      console.log(
        `${symbol}: [handleMacdSignal] Абсолютное значение MACD не снизилось. Current: ${currentHistogramAbs.toFixed(6)}, Previous: ${symbolData.prevHistogramAbs.toFixed(6)}`,
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

      console.log(`${symbol}: [handleMacdSignal] Higher timeframe analysis:
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

      console.log(`${symbol}: [handleMacdSignal] Signal conditions:
        Is short signal: ${isShortSignal}
        Is long signal: ${isLongSignal}
        Can open position by volume: ${canOpenPositionByVolume}`);

      const { closePrice: currentClosePrice } =
        symbolData.candles[symbolData.candles.length - 1];

      if (isLongSignal || isShortSignal) {
        const currentPrice = parseFloat(currentClosePrice);
        const currentTime = symbolData.candles[symbolData.candles.length - 1].startTime;
        const config = this.getProfitConfig();

        const signalType = isLongSignal ? '📈 Сигнал на открытие лонга' : '📉 Сигнал на открытие шорта';
        const formattedSymbol = formatSymbolForMarkdown(symbol);
        const formattedPrice = formatNumberForMarkdown(Number(currentClosePrice));
        const formattedTP = formatPercentageForMarkdown(config.profit);

        console.log(config, 'config');
        
        const signalContent = `${formattedSymbol} ${signalType}\n` +
          `Цена: ${formattedPrice}\n` +
          `TP: ${formattedTP}\n`;

        const messageId = await this.telegramService.sendInfoNotification(
          'Новый торговый сигнал',
          signalContent
        );

        const signal = new Signal();
        signal.symbol = symbol;
        signal.interval = this.INTERVAL;
        signal.entryPrice = currentPrice;
        signal.entryTime = currentTime;
        signal.type = isLongSignal ? 'long' : 'short';
        signal.active = true;
        signal.maxProfit = 0;
        signal.notified = false;
        signal.messageId = messageId;
        signal.status = 'active';
        signal.takeProfit = currentPrice * (1 + config.profit / 100);
        signal.timestamp = Date.now();
        signal.exitPrice = null;
        signal.exitTimestamp = null;
        signal.profitLoss = null;
        signal.validityHours = config.validityHours;

        await this.signalsService.createSignal(signal);
      } else {
        console.log(
          `${symbol}: [handleMacdSignal] Нет сигнала для открытия позиции. MACD малого таймфрейма: ${currentSign}, MACD большого таймфрейма: ${higherTimeframeHistogram.toFixed(6)}`,
        );
      }
    }
  }

  // Get profit/validity config for current timeframe
  private getProfitConfig(): { profit: number; validityHours: number } {
    return this.TIMEFRAME_CONFIG[this.INTERVAL] || { profit: 1, validityHours: 24 };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  private async cleanupOldSignals() {
    try {
      // Get signal statistics
      const stats = await this.signalsService.getSignalStats();
      
      // Format the daily report
      const reportHeader = formatHeaderForMarkdown('📊 Ежедневный отчет по сигналам');
      let reportContent = '';
      
      // Calculate overall statistics
      let totalSignals = 0;
      let totalProfitable = 0;
      
      for (const stat of stats) {
        totalSignals += Number(stat.total_signals);
        totalProfitable += Number(stat.profitable_signals);
      }
      
      const overallSuccessRate = totalSignals > 0 ? (totalProfitable / totalSignals * 100).toFixed(2) : '0.00';
      
      // Add overall statistics to report
      reportContent += `Общая статистика:\n` +
        `Всего сигналов: ${totalSignals}\n` +
        `Успешных: ${totalProfitable}\n` +
        `Процент успеха: ${overallSuccessRate}%\n`;
      
      // Send the report
      await this.telegramService.sendInfoNotification(
        reportHeader,
        reportContent
      );
      
      // Cleanup old signals (keep last 30 days)
      await this.signalsService.cleanupOldSignals(30);
      
    } catch (error) {
      await this.telegramService.sendErrorNotification(
        error,
        'Ошибка при формировании ежедневного отчета'
      );
    }
  }
}