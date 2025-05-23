import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RestClientV5, KlineIntervalV3, GetTickersParamsV5 } from 'bybit-api';
import { TelegramService } from '../telegram/telegram.service';
import { calculateSmoothedSMA } from '../trading-bot/utils/sma.utils';
import * as dayjs from 'dayjs';
import { Candle } from '../trading-bot/types';
import { formatSymbolForMarkdown } from '../telegram/telegram.utils';

@Injectable()
export class BybitService {
  private restClient: RestClientV5;
  private readonly VOLUME_SMA_SMOOTHING_PERIOD: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly telegramService: TelegramService,
  ) {
    this.restClient = new RestClientV5({
      key: this.configService.get<string>('BYBIT_API_KEY') ?? '',
      secret: this.configService.get<string>('BYBIT_API_SECRET') ?? '',
    });
    this.VOLUME_SMA_SMOOTHING_PERIOD = this.configService.get<string>(
      'VOLUME_SMA_SMOOTHING_PERIOD',
      '9',
    );
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
