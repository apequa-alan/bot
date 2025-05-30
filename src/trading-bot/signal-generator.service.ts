import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { calculateMACD } from './utils/macd.utils';
import { calculateSmoothedSMA } from './utils/sma.utils';
import { Candle } from './types';

@Injectable()
export class SignalGeneratorService {
  private readonly FAST_PERIOD: string;
  private readonly SLOW_PERIOD: string;
  private readonly SIGNAL_PERIOD: string;
  private readonly VOLUME_SMA_SMOOTHING_PERIOD: string;
  private readonly ONE_HISTOGRAM_DIRECTION_CANDLES: number;

  constructor(private readonly configService: ConfigService) {
    this.FAST_PERIOD = this.configService.get<string>('FAST_PERIOD', '12');
    this.SLOW_PERIOD = this.configService.get<string>('SLOW_PERIOD', '26');
    this.SIGNAL_PERIOD = this.configService.get<string>('SIGNAL_PERIOD', '9');
    this.VOLUME_SMA_SMOOTHING_PERIOD = this.configService.get<string>(
      'VOLUME_SMA_SMOOTHING_PERIOD',
      '9',
    );
    this.ONE_HISTOGRAM_DIRECTION_CANDLES = 3;
  }

  /**
   * Processes a new candle and generates a signal if conditions are met
   */
  async processCandle(
    symbol: string,
    candles: Candle[],
    prevHistogramAbs: number,
    smaVolumes: number[],
  ): Promise<{
    signal: boolean;
    newHistogramAbs: number;
    newSmaVolumes: number[];
  }> {
    const closingPrices = candles.map((item) => parseFloat(item.closePrice));
    const { histogram } = calculateMACD(
      closingPrices.reverse(),
      Number(this.FAST_PERIOD),
      Number(this.SLOW_PERIOD),
      Number(this.SIGNAL_PERIOD),
    );

    if (histogram.length === 0) {
      return {
        signal: false,
        newHistogramAbs: prevHistogramAbs,
        newSmaVolumes: smaVolumes,
      };
    }

    const latestHist = histogram[histogram.length - 1];
    const latestHistAbs = Math.abs(latestHist);

    // Calculate volume SMA
    const volumes = candles.map((item) => parseFloat(item.volume));
    const smoothedSMA = calculateSmoothedSMA(
      volumes,
      Number(this.VOLUME_SMA_SMOOTHING_PERIOD),
    );

    if (smoothedSMA === null) {
      return {
        signal: false,
        newHistogramAbs: prevHistogramAbs,
        newSmaVolumes: smaVolumes,
      };
    }

    const newSmaVolumes = [...smaVolumes, smoothedSMA].slice(-2);

    // Check if we have enough candles in the same direction
    const hasEnoughCandlesInDirection = this.checkHistogramDirection(
      histogram,
      this.ONE_HISTOGRAM_DIRECTION_CANDLES,
    );

    // Check if volume is increasing
    const isVolumeIncreasing =
      newSmaVolumes.length >= 2 &&
      newSmaVolumes[newSmaVolumes.length - 1] > newSmaVolumes[newSmaVolumes.length - 2];

    // Generate signal if conditions are met
    const signal =
      hasEnoughCandlesInDirection &&
      isVolumeIncreasing &&
      latestHistAbs > prevHistogramAbs;

    return {
      signal,
      newHistogramAbs: latestHistAbs,
      newSmaVolumes,
    };
  }

  /**
   * Checks if we have enough candles in the same direction
   */
  private checkHistogramDirection(
    histogram: number[],
    requiredCandles: number,
  ): boolean {
    if (histogram.length < requiredCandles) {
      return false;
    }

    const lastCandles = histogram.slice(-requiredCandles);
    const allPositive = lastCandles.every((value) => value > 0);
    const allNegative = lastCandles.every((value) => value < 0);

    return allPositive || allNegative;
  }
} 