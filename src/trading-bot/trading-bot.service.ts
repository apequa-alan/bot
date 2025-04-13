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
  // Клиенты и переменные
  private ws: WebsocketClient;
  private symbolData: Map<string, SymbolData> = new Map();
  private readonly TOP_VOLUME_COINS_COUNT = 10;

  // Константы для анализа MACD
  private readonly ONE_HISTOGRAM_DIRECTION_CANDLES = 5;

  // Конфигурационные переменные
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
  ) {
    // Инициализация конфигурационных переменных
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

    // Запуск бота
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

      // Получаем текущие отслеживаемые монеты
      const currentCoins = Array.from(this.symbolData.keys());

      // Определяем монеты, которые нужно добавить и удалить
      const coinsToAdd = newTopCoins.filter(
        (coin) => !currentCoins.includes(coin),
      );
      const coinsToRemove = currentCoins.filter(
        (coin) => !newTopCoins.includes(coin),
      );

      // Отписываемся от монет, которые больше не в топе
      for (const symbol of coinsToRemove) {
        const wsKlineTopicEvent = `kline.${this.INTERVAL}.${symbol}`;
        this.ws.unsubscribeV5(wsKlineTopicEvent, 'linear');
        this.symbolData.delete(symbol);
        console.log(`Прекращено отслеживание ${symbol}`);
      }

      // Подписываемся на новые монеты и инициализируем их данные
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
    // Проверяем ослабление сигнала: если абсолютное значение MACD не снизилось
    if (currentHistogramAbs >= symbolData.prevHistogramAbs) {
      console.log(
        `${symbol}: [handleMacdSignal] Абсолютное значение MACD не снизилось.`,
      );
      symbolData.prevHistogramAbs = currentHistogramAbs;
      return;
    }

    // Отправляем уведомление в Telegram о возможности открытия позиции
    if (canOpenPositionByVolume) {
      const currentPrice =
        symbolData.candles[symbolData.candles.length - 1].closePrice;
      const currentTime =
        symbolData.candles[symbolData.candles.length - 1].startTime;

      // Отправляем сигнал на открытие позиции против направления MACD
      if (currentSign < 0) {
        await this.telegramService.sendNotification(
          'info',
          `${symbol} 📈 Сигнал на открытие лонга\n` +
            `Цена: ${currentPrice}\n` +
            `Время: ${currentTime}\n` +
            `MACD: ${histogramValue.toFixed(6)}\n` +
            `Тип: Против тренда`,
        );
      } else if (currentSign > 0) {
        await this.telegramService.sendNotification(
          'info',
          `${symbol} 📉 Сигнал на открытие шорта\n` +
            `Цена: ${currentPrice}\n` +
            `Время: ${currentTime}\n` +
            `MACD: ${histogramValue.toFixed(6)}\n` +
            `Тип: Против тренда`,
        );
      }
    }
  }
}
