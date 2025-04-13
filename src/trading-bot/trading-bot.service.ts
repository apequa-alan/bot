import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dayjs from 'dayjs';
import { WebsocketClient, RestClientV5, KlineIntervalV3 } from 'bybit-api';
import { TelegramService } from '../telegram/telegram.service';
import { calculateMACD } from './utils/macd.utils';
import { calculateSmoothedSMA } from './utils/sma.utils';
import { SymbolData, Candle } from './types';

@Injectable()
export class TradingBotService implements OnModuleInit {
  // Клиенты и переменные
  private restClient: RestClientV5;
  private ws: WebsocketClient;
  private symbolData: Map<string, SymbolData> = new Map();
  private readonly TOP_VOLUME_COINS_COUNT = 10;
  private readonly VOLUME_UPDATE_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
  private volumeUpdateTimer: NodeJS.Timeout;

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
    // Инициализация клиентов Bybit
    this.restClient = new RestClientV5({
      key: this.BYBIT_API_KEY,
      secret: this.BYBIT_API_SECRET,
    });

    this.ws = new WebsocketClient({
      market: 'v5',
      key: this.BYBIT_API_KEY,
      secret: this.BYBIT_API_SECRET,
    });

    // Запуск бота
    await this.startBot();
  }

  private async updateTopVolumeCoins() {
    try {
      const newTopCoins = await this.getTopVolumeCoins();
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
        await this.ws.unsubscribeV5(wsKlineTopicEvent, 'linear');
        this.symbolData.delete(symbol);
        console.log(`Прекращено отслеживание ${symbol}`);
      }

      // Подписываемся на новые монеты и инициализируем их данные
      for (const symbol of coinsToAdd) {
        const candles = await this.fetchCandlesWithoutLast(
          symbol,
          this.INTERVAL,
          300,
        );
        this.symbolData.set(symbol, {
          symbol,
          candles,
          smaVolumes: [],
          prevHistogramAbs: 0,
        });

        const wsKlineTopicEvent = `kline.${this.INTERVAL}.${symbol}`;
        await this.ws.subscribeV5(wsKlineTopicEvent, 'linear');
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
        `Ошибка при обновлении списка монет: ${error.message}`,
      );
    }
  }

  private async getTopVolumeCoins(): Promise<string[]> {
    try {
      const response = await this.restClient.getTickers({
        category: 'linear',
      });

      if (!response || !response.result?.list) {
        console.error('Некорректный ответ от Bybit при получении списка монет');
        await this.telegramService.sendNotification(
          'error',
          'Некорректный ответ от Bybit при получении списка монет.',
        );
        return [];
      }

      // Сортируем монеты по объему и берем топ-10
      const sortedCoins = response.result.list
        .sort((a, b) => parseFloat(b.volume24h) - parseFloat(a.volume24h))
        .slice(0, this.TOP_VOLUME_COINS_COUNT)
        .map((coin) => coin.symbol);

      console.log(
        `Топ ${this.TOP_VOLUME_COINS_COUNT} монет по объему:`,
        sortedCoins,
      );
      await this.telegramService.sendNotification(
        'info',
        `Топ ${this.TOP_VOLUME_COINS_COUNT} монет по объему:\n${sortedCoins.join('\n')}`,
      );

      return sortedCoins;
    } catch (error) {
      console.error('Ошибка при получении списка монет', error);
      await this.telegramService.sendNotification(
        'error',
        `Ошибка при получении списка монет: ${error.message}`,
      );
      return [];
    }
  }

  private async fetchCandlesWithoutLast(
    symbol: string,
    interval: KlineIntervalV3,
    limit: number,
  ): Promise<any[]> {
    try {
      const response = await this.restClient.getKline({
        symbol,
        interval,
        category: 'linear',
        limit,
      });

      if (!response || !response.result?.list) {
        console.error('Некорректный ответ от Bybit', response);
        await this.telegramService.sendNotification(
          'error',
          `Некорректный ответ от Bybit при получении свечей для ${symbol}.`,
        );
        return [];
      }

      const list = response.result.list.map((candle) => ({
        openTime: candle[0],
        time: dayjs(Number(candle[0])).format('YY-MM-DD HH:mm'),
        closePrice: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));

      list.sort((a, b) => Number(a.openTime) - Number(b.openTime));
      list.pop(); // Убираем последнюю незакрытую свечу

      const smoothedSMA = calculateSmoothedSMA(
        list.map((item) => item.volume),
        Number(this.VOLUME_SMA_SMOOTHING_PERIOD),
      );

      if (smoothedSMA !== null) {
        const symbolData = this.symbolData.get(symbol) || {
          symbol,
          candles: [],
          smaVolumes: [],
          prevHistogramAbs: 0,
        };
        symbolData.smaVolumes.push(smoothedSMA);
        this.symbolData.set(symbol, symbolData);
      }

      console.log(
        `${symbol}: ${list.length} свечей (без последней незакрытой).`,
      );
      return list;
    } catch (error) {
      console.error(`Ошибка при запросе свечей для ${symbol}`, error);
      await this.telegramService.sendNotification(
        'error',
        `Ошибка при запросе свечей для ${symbol}: ${error.message}`,
      );
      return [];
    }
  }

  private async startBot() {
    try {
      // Получаем начальный список монет
      await this.updateTopVolumeCoins();

      // Устанавливаем таймер для обновления списка каждые 4 часа
      this.volumeUpdateTimer = setInterval(
        () => this.updateTopVolumeCoins(),
        this.VOLUME_UPDATE_INTERVAL,
      );

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

      (this.ws as any).on('error', (err: Record<string, string>) => {
        console.error('WebSocket ошибка:', err);
        this.telegramService.sendNotification(
          'error',
          `WebSocket ошибка: ${err.message}`,
        );
      });

      this.ws.on('update', async (data) => {
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
          openTime: latestKline.start,
          time: startTime,
          closePrice: close,
          volume: parseFloat(latestKline.volume),
        });

        const closingPrices = symbolData.candles.map((item) => item.closePrice);
        const { histogram, macdLine, signalLine } = calculateMACD(
          closingPrices,
          Number(this.FAST_PERIOD),
          Number(this.SLOW_PERIOD),
          Number(this.SIGNAL_PERIOD),
        );

        if (histogram.length) {
          const latestHist = histogram[histogram.length - 1];
          console.log(
            `${symbol}: [ws update] MACD hist=${latestHist.toFixed(6)}, closePrice=${symbolData.candles[histogram.length - 1].closePrice}, closeTime=${symbolData.candles[histogram.length - 1].time}, (fast=${macdLine[macdLine.length - 1].toFixed(6)}, signal=${signalLine[signalLine.length - 1].toFixed(6)})`,
          );

          const smoothedSMA = calculateSmoothedSMA(
            symbolData.candles.map(({ volume }) => volume),
            Number(this.VOLUME_SMA_SMOOTHING_PERIOD),
          );

          if (smoothedSMA !== null) {
            symbolData.smaVolumes.push(smoothedSMA);
          }

          const currentSmoothedSmaVolume =
            symbolData.smaVolumes[symbolData.smaVolumes.length - 1];
          const previousSmoothedSmaVolume =
            symbolData.smaVolumes[symbolData.smaVolumes.length - 2];
          const currentVolume =
            symbolData.candles[symbolData.candles.length - 1].volume;
          const previousVolume =
            symbolData.candles[symbolData.candles.length - 2].volume;
          const increaseVolumePercent =
            ((currentVolume - previousVolume) / previousVolume) * 100;

          const openPositionCondition =
            increaseVolumePercent > 10 ||
            currentSmoothedSmaVolume > previousSmoothedSmaVolume;
          await this.handleMacdSignal(
            symbol,
            latestHist,
            openPositionCondition,
          );
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
        `Ошибка при запуске бота: ${error.message}`,
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
      symbolData.candles.map((item) => item.closePrice),
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
        symbolData.candles[symbolData.candles.length - 1].time;

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
