import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dayjs from 'dayjs';
import { WebsocketClient, RestClientV5, KlineIntervalV3 } from 'bybit-api';
import { TelegramService } from '../telegram/telegram.service';
import { calculateMACD } from './utils/macd.utils';
import { calculateSmoothedSMA } from './utils/sma.utils';

@Injectable()
export class TradingBotService implements OnModuleInit {
  // Клиенты и переменные
  private restClient: RestClientV5;
  private ws: WebsocketClient;
  private candles: any[] = [];
  private smaVolumes: number[] = [];
  private prevHistogramAbs = 0;

  // Константы для анализа MACD
  private readonly ONE_HISTOGRAM_DIRECTION_CANDLES = 5;

  // Конфигурационные переменные
  private readonly BYBIT_API_KEY: string;
  private readonly BYBIT_API_SECRET: string;
  private readonly SYMBOL: string;
  private readonly INTERVAL: KlineIntervalV3;
  private readonly FAST_PERIOD: string;
  private readonly SLOW_PERIOD: string;
  private readonly SIGNAL_PERIOD: string;
  private readonly VOLUME_SMA_SMOOTHING_PERIOD: string;
  private readonly DEMO: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly telegramService: TelegramService,
  ) {
    // Инициализация конфигурационных переменных
    // this.DEMO = this.configService.get<string>('DEMO', 'true');
    this.BYBIT_API_KEY = this.configService.get<string>('BYBIT_API_KEY') ?? '';
    this.BYBIT_API_SECRET = this.configService.get<string>('BYBIT_API_SECRET') ?? '';
    this.SYMBOL = this.configService.get<string>('SYMBOL', '');
    this.INTERVAL = this.configService.get<string>('INTERVAL', '1') as KlineIntervalV3;
    this.FAST_PERIOD = this.configService.get<string>('FAST_PERIOD', '12');
    this.SLOW_PERIOD = this.configService.get<string>('SLOW_PERIOD', '26');
    this.SIGNAL_PERIOD = this.configService.get<string>('SIGNAL_PERIOD', '9');
    this.VOLUME_SMA_SMOOTHING_PERIOD = this.configService.get<string>('VOLUME_SMA_SMOOTHING_PERIOD', '9');
  }

  async onModuleInit() {
    // Инициализация клиентов Bybit
    this.restClient = new RestClientV5({
      key: this.BYBIT_API_KEY,
      secret: this.BYBIT_API_SECRET,
      // demoTrading: JSON.parse(this.DEMO.toLowerCase()) as boolean,
    });

    this.ws = new WebsocketClient({
      market: 'v5',
      key: this.BYBIT_API_KEY,
      secret: this.BYBIT_API_SECRET,
    });

    // Запуск бота
    await this.startBot();
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
          'Некорректный ответ от Bybit при получении свечей.',
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
        this.smaVolumes.push(smoothedSMA);
      }

      console.log(`${list.length} свечей (без последней незакрытой).`);
      await this.telegramService.sendNotification(
        'info',
        `Получено ${list.length} исторических свечей.`,
      );
      return list;
    } catch (error) {
      console.error('Ошибка при запросе fetchCandles', error);
      await this.telegramService.sendNotification(
        'error',
        `Ошибка при запросе свечей: ${error.message}`,
      );
      return [];
    }
  }

  private async startBot() {
    try {
      // Инициализируем исторические свечи
      this.candles = await this.fetchCandlesWithoutLast(
        this.SYMBOL,
        this.INTERVAL,
        300,
      );

      // Подписка на обновления через WebSocket
      const wsKlineTopicEvent = `kline.${this.INTERVAL}.${this.SYMBOL}`;
      await this.ws.subscribeV5(wsKlineTopicEvent, 'linear');

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
        if (data.topic === wsKlineTopicEvent) {
          const klineArray = data.data;
          const latestKline = klineArray[0];
          if (!latestKline) return;

          const close = parseFloat(latestKline.close);
          const isClosed = latestKline.confirm;
          if (!isClosed) return;

          const startTime = dayjs(latestKline.start).format('YY-MM-DD HH:mm');
          console.log(`Новая закрытая свеча: ${startTime}, close=${close}`);
          this.candles.push({
            openTime: latestKline.start,
            time: startTime,
            closePrice: close,
            volume: parseFloat(latestKline.volume),
          });

          const closingPrices = this.candles.map((item) => item.closePrice);
          const { histogram, macdLine, signalLine } = calculateMACD(
            closingPrices,
            Number(this.FAST_PERIOD),
            Number(this.SLOW_PERIOD),
            Number(this.SIGNAL_PERIOD),
          );

          if (histogram.length) {
            const latestHist = histogram[histogram.length - 1];
            console.log(
              `[ws update] MACD hist=${latestHist.toFixed(6)}, closePrice=${this.candles[histogram.length - 1].closePrice}, closeTime=${this.candles[histogram.length - 1].time}, (fast=${macdLine[macdLine.length - 1].toFixed(6)}, signal=${signalLine[signalLine.length - 1].toFixed(6)})`,
            );

            const smoothedSMA = calculateSmoothedSMA(
              this.candles.map(({ volume }) => volume),
              Number(this.VOLUME_SMA_SMOOTHING_PERIOD),
            );

            if (smoothedSMA !== null) {
              this.smaVolumes.push(smoothedSMA);
            }

            const currentSmoothedSmaVolume = this.smaVolumes[this.smaVolumes.length - 1];
            const previousSmoothedSmaVolume = this.smaVolumes[this.smaVolumes.length - 2];
            const currentVolume = this.candles[this.candles.length - 1].volume;
            const previousVolume = this.candles[this.candles.length - 2].volume;
            const increaseVolumePercent = ((currentVolume - previousVolume) / previousVolume) * 100;

            const openPositionCondition = increaseVolumePercent > 10 || currentSmoothedSmaVolume > previousSmoothedSmaVolume;
            await this.handleMacdSignal(latestHist, openPositionCondition);
          }
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

  private async handleMacdSignal(histogramValue: number, canOpenPositionByVolume: boolean) {
    const currentHistogramAbs = Math.abs(histogramValue);
    const currentSign = Math.sign(histogramValue);

    // Проверяем, что для анализа доступно достаточно свечей
    const macdResult = calculateMACD(
      this.candles.map((item) => item.closePrice),
      Number(this.FAST_PERIOD),
      Number(this.SLOW_PERIOD),
      Number(this.SIGNAL_PERIOD),
    );
    if (macdResult.histogram.length < this.ONE_HISTOGRAM_DIRECTION_CANDLES) {
      console.log(
        `[handleMacdSignal] Недостаточно свечей для проверки MACD направления. Требуется минимум ${this.ONE_HISTOGRAM_DIRECTION_CANDLES} свечей.`,
      );
      return;
    }
    const lastCandles = macdResult.histogram.slice(-this.ONE_HISTOGRAM_DIRECTION_CANDLES);
    const allSame = lastCandles.every((value) => Math.sign(value) === currentSign);
    if (!allSame) {
      console.log(
        `[handleMacdSignal] Последние ${this.ONE_HISTOGRAM_DIRECTION_CANDLES} свечей не подтверждают единое направление MACD.`,
      );
      return;
    }
    // Проверяем ослабление сигнала: если абсолютное значение MACD не снизилось
    if (currentHistogramAbs >= this.prevHistogramAbs) {
      console.log('[handleMacdSignal] Абсолютное значение MACD не снизилось.');
      this.prevHistogramAbs = currentHistogramAbs;
      return;
    }

    // Отправляем уведомление в Telegram о возможности открытия позиции
    if (canOpenPositionByVolume) {
      const currentPrice = this.candles[this.candles.length - 1].closePrice;
      const currentTime = this.candles[this.candles.length - 1].time;

      // Отправляем сигнал на открытие позиции против направления MACD
      if (currentSign < 0) {
        await this.telegramService.sendNotification(
          'info',
          `📈 Сигнал на открытие лонга\n` +
            `Цена: ${currentPrice}\n` +
            `Время: ${currentTime}\n` +
            `MACD: ${histogramValue.toFixed(6)}\n` +
            `Тип: Против тренда`,
        );
      } else if (currentSign > 0) {
        await this.telegramService.sendNotification(
          'info',
          `📉 Сигнал на открытие шорта\n` +
            `Цена: ${currentPrice}\n` +
            `Время: ${currentTime}\n` +
            `MACD: ${histogramValue.toFixed(6)}\n` +
            `Тип: Против тренда`,
        );
      }
    }
  }
}
