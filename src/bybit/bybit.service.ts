import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RestClientV5, KlineIntervalV3, GetTickersParamsV5, WebsocketClient } from 'bybit-api';
import { TelegramService } from '../telegram/telegram.service';
import { calculateSmoothedSMA } from '../trading-bot/utils/sma.utils';
import * as dayjs from 'dayjs';
import { Candle } from '../trading-bot/types';
import { formatSymbolForMarkdown } from '../telegram/telegram.utils';

@Injectable()
export class BybitService {
  private restClient: RestClientV5;
  private wsClient: WebsocketClient;
  private readonly VOLUME_SMA_SMOOTHING_PERIOD: string;
  private activeSubscriptions: Map<string, boolean> = new Map();

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
  ) {
    this.restClient = new RestClientV5({
      key: this.configService.get<string>('BYBIT_API_KEY') ?? '',
      secret: this.configService.get<string>('BYBIT_API_SECRET') ?? '',
    });

    this.wsClient = new WebsocketClient({
      market: 'v5',
    });

    this.VOLUME_SMA_SMOOTHING_PERIOD = this.configService.get<string>(
      'VOLUME_SMA_SMOOTHING_PERIOD',
      '9',
    );

    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers(): void {
    this.wsClient.on('update', (data) => {
      // Handle incoming WebSocket data
      console.log('WebSocket update:', data);
    });

    // Type assertion for error handler
    type ErrorHandler = (error: Error) => void;
    (this.wsClient.on as (event: string, handler: ErrorHandler) => void)('error', (error: Error) => {
      console.error('WebSocket error:', error);
    });

    this.wsClient.on('close', () => {
      console.log('WebSocket connection closed');
    });

    this.wsClient.on('reconnect', () => {
      console.log('WebSocket reconnecting...');
    });

    this.wsClient.on('reconnected', () => {
      console.log('WebSocket reconnected');
    });
  }

  /**
   * Registers a handler for WebSocket updates
   */
  onWebSocketUpdate(handler: (data: any) => void): void {
    this.wsClient.on('update', handler);
  }

  private generateSubscriptionKey(symbol: string, interval: string): string {
    return `${symbol.toUpperCase()}_${interval.toLowerCase()}`;
  }

  async subscribeToKline(symbol: string, interval: string): Promise<void> {
    const subscriptionKey = this.generateSubscriptionKey(symbol, interval);
    
    if (this.activeSubscriptions.has(subscriptionKey)) {
      return;
    }

    try {
      await this.wsClient.subscribe([`kline.${interval}.${symbol}`]);
      this.activeSubscriptions.set(subscriptionKey, true);
    } catch (error) {
      throw new Error(`Failed to subscribe to kline: ${error.message}`);
    }
  }

  async unsubscribeFromKline(symbol: string, interval: string): Promise<void> {
    const subscriptionKey = this.generateSubscriptionKey(symbol, interval);
    
    if (!this.activeSubscriptions.has(subscriptionKey)) {
      return;
    }

    try {
      await this.wsClient.unsubscribe([`kline.${interval}.${symbol}`]);
      this.activeSubscriptions.delete(subscriptionKey);
    } catch (error) {
      throw new Error(`Failed to unsubscribe from kline: ${error.message}`);
    }
  }

  async getTickers(params: GetTickersParamsV5<'inverse'>) {
    return await this.restClient.getTickers(params);
  }

  async getTopVolumeCoins(topCount: number): Promise<string[]> {
    try {
      const response = await this.getTickers({
        category: 'inverse',
      });

      if (!response || !response.result?.list) {
        console.error('Некорректный ответ от Bybit при получении списка монет');
        return [];
      }

      // Filter out symbols with numbers and sort by volume
      const sortedCoins = response.result.list
        .filter(coin => !/\d/.test(coin.symbol)) // Filter out symbols with numbers
        .sort((a, b) => parseFloat(b.volume24h) - parseFloat(a.volume24h))
        .slice(0, topCount)
        .map((coin) => `${coin.symbol}T`);

      console.log(`Топ ${topCount} монет по объему:`, sortedCoins);
      return sortedCoins;
    } catch (error) {
      console.error('Ошибка при получении списка монет', error);
      return [];
    }
  }

  async fetchCandlesWithoutLast(
    symbol: string,
    interval: KlineIntervalV3,
    limit: number,
  ): Promise<{ candles: Candle[]; smoothedSMA: number | null }> {
    try {
      const response = await this.restClient.getKline({
        symbol,
        interval,
        category: 'linear',
        limit,
      });

      if (!response || !response.result?.list) {
        console.error(
          `Некорректный ответ от Bybit при получении свечей для ${symbol}`,
        );
        await this.telegramService.sendNotification(
          'error',
          `Некорректный ответ от Bybit при получении свечей для ${formatSymbolForMarkdown(symbol)}\.`,
        );
        return { candles: [], smoothedSMA: null };
      }

      const list = response.result.list.map((candle) => ({
        openPrice: candle[1],
        startTime: dayjs(Number(candle[0])).format('YY-MM-DD HH:mm'),
        closePrice: candle[4],
        volume: candle[5],
        highPrice: candle[2],
        lowPrice: candle[3],
        turnover: candle[6],
      }));

      list.sort((a, b) => Number(a.startTime) - Number(b.startTime));
      list.pop(); // Убираем последнюю незакрытую свечу

      const smoothedSMA = calculateSmoothedSMA(
        list.map((item) => Number(item.volume)),
        Number(this.VOLUME_SMA_SMOOTHING_PERIOD),
      );

      console.log(
        `${symbol}: ${list.length} свечей (без последней незакрытой).`,
      );
      return { candles: list, smoothedSMA };
    } catch (error) {
      console.error(`Ошибка при запросе свечей для ${symbol}`, error);
      await this.telegramService.sendNotification(
        'error',
        `Ошибка при запросе свечей для ${formatSymbolForMarkdown(symbol)}: ${error}`,
      );
      return { candles: [], smoothedSMA: null };
    }
  }
}
