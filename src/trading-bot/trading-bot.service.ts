import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dayjs from 'dayjs';
import { WebsocketClient, KlineIntervalV3 } from 'bybit-api';
import { TelegramService } from '../telegram/telegram.service';
import { BybitService } from '../bybit/bybit.service';
import { calculateMACD } from './utils/macd.utils';
import { calculateSmoothedSMA } from './utils/sma.utils';
import { SymbolData, WsKlineV5 } from './types';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TradingBotService implements OnModuleInit {
  private ws: WebsocketClient;
  private symbolData: Map<string, SymbolData> = new Map();
  private readonly TOP_VOLUME_COINS_COUNT = 10;
  private readonly ONE_HISTOGRAM_DIRECTION_CANDLES = 5;

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
        console.error(
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
            300,
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
      console.error('Ошибка при обновлении списка монет', error);
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
        this.telegramService.sendNotification(
          'info',
          'WebSocket подключен к Bybit.',
        );
      });

      this.ws.on('close', () => {
        console.log('WebSocket отключен.');
        this.telegramService.sendNotification('error', 'WebSocket отключился.');
      });

      this.ws.on('error', ((error: any) => {
        console.error('WebSocket ошибка:', error);
        this.telegramService.sendNotification(
          'error',
          `WebSocket ошибка: ${error}`,
        );
      }) as unknown as never);

      this.ws.on('update', (data: { topic: string; data: WsKlineV5[] }) => {
        if (!data.topic || !data.data) return;

        const symbol = data.topic.split('.')[2];
        const symbolData = this.symbolData.get(symbol);
        if (!symbolData) return;

        const klineArray = data.data;
        const latestKline = klineArray[0];
        if (!latestKline) return;

        const close = parseFloat(latestKline.close);
        const isClosed = latestKline.confirm;
        if (!isClosed) return;

        const startTime = dayjs(latestKline.start).format('YY-MM-DD HH:mm');
        console.log(
          `${symbol}: Новая закрытая свеча: ${startTime}, close=${close}`,
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
          closingPrices,
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
          ).catch((error) => {
            console.error(`Error handling MACD signal for ${symbol}:`, error);
          });
        }
      });

      console.log('Бот запущен и ожидает новые свечи по WebSocket...');
      await this.telegramService.sendNotification(
        'info',
        'Бот запущен и ожидает новые свечи.',
      );
    } catch (error) {
      console.error('Ошибка при запуске бота', error);
      await this.telegramService.sendNotification(
        'error',
        `Ошибка при запуске бота: ${error}`,
      );
    }
  }

  private async handleMacdSignal(
    symbol: string,
    histogramValue: number,
    canOpenPositionByVolume: boolean,
  ) {
    const symbolData = this.symbolData.get(symbol);
    if (!symbolData) return;

    const currentHistogramAbs = Math.abs(histogramValue);
    const currentSign = Math.sign(histogramValue);

    // Проверяем, что для анализа доступно достаточно свечей
    const macdResult = calculateMACD(
      symbolData.candles.map((item) => parseFloat(item.closePrice)),
      Number(this.FAST_PERIOD),
      Number(this.SLOW_PERIOD),
      Number(this.SIGNAL_PERIOD),
    );
    if (macdResult.histogram.length < this.ONE_HISTOGRAM_DIRECTION_CANDLES) {
      console.log(
        `${symbol}: [handleMacdSignal] Недостаточно свечей для проверки MACD направления. Требуется минимум ${this.ONE_HISTOGRAM_DIRECTION_CANDLES} свечей.`,
      );
      return;
    }
    const lastCandles = macdResult.histogram.slice(
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
          300,
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
        higherTimeframeMACD.histogram[higherTimeframeMACD.histogram.length - 1];
      const higherTimeframePrevHistogram =
        higherTimeframeMACD.histogram[higherTimeframeMACD.histogram.length - 2];
      const higherTimeframeStartedToDown =
        Math.abs(higherTimeframeHistogram) <
        Math.abs(higherTimeframePrevHistogram);

      // For short position: small timeframe MACD > 0 and higher timeframe MACD < 0
      // For long position: small timeframe MACD < 0 and higher timeframe MACD > 0
      const isShortSignal = currentSign > 0 && higherTimeframeHistogram < 0;
      const isLongSignal = currentSign < 0 && higherTimeframeHistogram > 0;

      if (isShortSignal || isLongSignal || higherTimeframeStartedToDown) {
        const currentPrice =
          symbolData.candles[symbolData.candles.length - 1].closePrice;
        const currentTime =
          symbolData.candles[symbolData.candles.length - 1].startTime;

        if (isLongSignal) {
          await this.telegramService.sendNotification(
            'info',
            `${symbol} 📈 Сигнал на открытие лонга\n` +
              `Цена: ${currentPrice}\n` +
              `Время: ${currentTime}\n` +
              `MACD: ${histogramValue.toFixed(6)}\n` +
              `MACD (${higherInterval}m): ${higherTimeframeHistogram.toFixed(6)}\n` +
              `MACD (${higherInterval}m) prev: ${higherTimeframePrevHistogram.toFixed(6)}\n` +
              `Тип: ${higherTimeframeStartedToDown ? 'Начало разворота' : 'Против тренда'}`,
          );
        } else if (isShortSignal) {
          await this.telegramService.sendNotification(
            'info',
            `${symbol} 📉 Сигнал на открытие шорта\n` +
              `Цена: ${currentPrice}\n` +
              `Время: ${currentTime}\n` +
              `MACD: ${histogramValue.toFixed(6)}\n` +
              `MACD (${higherInterval}m): ${higherTimeframeHistogram.toFixed(6)}\n` +
              `MACD (${higherInterval}m) prev: ${higherTimeframePrevHistogram.toFixed(6)}\n` +
              `Тип: ${higherTimeframeStartedToDown ? 'Начало разворота' : 'Против тренда'}`,
          );
        }
      } else {
        console.log(
          `${symbol}: [handleMacdSignal] Нет сигнала для открытия позиции. MACD малого таймфрейма: ${currentSign}, MACD большого таймфрейма: ${higherTimeframeHistogram.toFixed(6)}`,
        );
      }
    }
  }
}
