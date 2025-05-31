import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetTickersParamsV5, KlineIntervalV3, RestClientV5 } from 'bybit-api';
import { TelegramService } from '../telegram/telegram.service';
import { calculateSmoothedSMA } from '../trading-bot/utils/sma.utils';
import * as dayjs from 'dayjs';
import { Candle } from '../trading-bot/types';

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

      console.log(response, 'getTopVolumeCoins');
      if (!response || !response.result?.list) {
        console.error('Некорректный ответ от Bybit при получении списка монет');
        return [];
      }

      // Filter out symbols with numbers and sort by volume
      const sortedCoins = response.result.list
        .filter((coin) => !/\d/.test(coin.symbol)) // Filter out symbols with numbers
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
      const formattedSymbol = symbol.endsWith('T') ? symbol : `${symbol}T`;
      const response = await this.restClient.getKline({
        symbol: formattedSymbol,
        interval,
        category: 'linear',
        limit,
      });

      if (!response) {
        console.error(`No response from Bybit for ${formattedSymbol}`);
        return { candles: [], smoothedSMA: null };
      }

      if (!response.result?.list) {
        console.error(
          `Invalid response from Bybit for ${formattedSymbol}:`,
          JSON.stringify(response, null, 2),
        );
        await this.telegramService.sendErrorNotification({
          error: new Error('Invalid response from Bybit'),
          context: `Некорректный ответ от Bybit при получении свечей для ${formattedSymbol}`,
          userId: this.configService.get<string>('TELEGRAM_CHANNEL_ID', ''),
        });
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
        `${formattedSymbol}: ${list.length} свечей (без последней незакрытой).`,
      );
      return { candles: list, smoothedSMA };
    } catch (error) {
      console.error(`Ошибка при запросе свечей для ${symbol}:`, error);
      return { candles: [], smoothedSMA: null };
    }
  }
}
