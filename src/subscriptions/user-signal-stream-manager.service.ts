import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BybitService } from '../bybit/bybit.service';
import { SignalGeneratorService } from '../trading-bot/signal-generator.service';
import { SignalsService } from '../signals/signals.service';
import { SignalDispatcherService } from '../signals/signal-dispatcher.service';
import { SubscriptionsService } from './subscriptions.service';
import { Candle } from '../trading-bot/types';
import { KlineIntervalV3 } from 'bybit-api';
import { Signal } from '../signals/entities/signal.entity';

interface SymbolData {
  symbol: string;
  interval: string;
  candles: Candle[];
  smaVolumes: number[];
  prevHistogramAbs: number;
}

interface WebSocketKlineData {
  topic: string;
  data: {
    start: number;
    end: number;
    interval: string;
    open: string;
    close: string;
    high: string;
    low: string;
    volume: string;
    turnover: string;
    confirm: boolean;
    timestamp: string;
  }[];
}

@Injectable()
export class UserSignalStreamManagerService {
  private activeStreams: Map<string, boolean> = new Map();
  private symbolData: Map<string, SymbolData> = new Map();

  constructor(
    @Inject(forwardRef(() => BybitService))
    private readonly bybitService: BybitService,
    @Inject(forwardRef(() => SignalGeneratorService))
    private readonly signalGenerator: SignalGeneratorService,
    @Inject(forwardRef(() => SignalsService))
    private readonly signalsService: SignalsService,
    @Inject(forwardRef(() => SignalDispatcherService))
    private readonly signalDispatcher: SignalDispatcherService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
  ) {
    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers(): void {
    this.bybitService.onWebSocketUpdate((data: WebSocketKlineData) => {
      if (data.topic?.startsWith('kline.')) {
        const [_, interval, symbol] = data.topic.split('.');
        const streamKey = this.generateStreamKey(symbol, interval);
        if (data.data && data.data.length > 0) {
          this.handleKlineUpdate(streamKey, data.data[0]);
        }
      }
    });
  }

  /**
   * Generates a unique key for a symbol and interval combination
   */
  private generateStreamKey(symbol: string, interval: string): string {
    return `${symbol.toUpperCase()}_${interval.toLowerCase()}`;
  }

  /**
   * Subscribes to real-time data for a specific symbol and interval
   */
  async subscribeToSymbolStream(symbol: string, interval: string): Promise<void> {
    const streamKey = this.generateStreamKey(symbol, interval);
    
    if (this.activeStreams.has(streamKey)) {
      return;
    }

    try {
      // Fetch historical candles
      const { candles, smoothedSMA } = await this.bybitService.fetchCandlesWithoutLast(
        symbol,
        interval as KlineIntervalV3,
        300, // Use the same limit as in TradingBotService
      );

      if (smoothedSMA === null) {
        throw new Error(`Failed to calculate SMA for ${symbol}`);
      }

      // Initialize symbol data
      this.symbolData.set(streamKey, {
        symbol,
        interval,
        candles,
        smaVolumes: [smoothedSMA],
        prevHistogramAbs: 0,
      });

      // Subscribe to WebSocket
      await this.bybitService.subscribeToKline(symbol, interval);
      this.activeStreams.set(streamKey, true);

      // Set up WebSocket handler
      this.bybitService.subscribeToKline(symbol, interval);
    } catch (error) {
      throw new Error(`Failed to subscribe to ${symbol} ${interval} stream: ${error.message}`);
    }
  }

  /**
   * Unsubscribes from a symbol and interval stream
   */
  async unsubscribeFromSymbolStream(symbol: string, interval: string): Promise<void> {
    const streamKey = this.generateStreamKey(symbol, interval);
    
    if (!this.activeStreams.has(streamKey)) {
      return;
    }

    try {
      await this.bybitService.unsubscribeFromKline(symbol, interval);
      this.activeStreams.delete(streamKey);
      this.symbolData.delete(streamKey);
    } catch (error) {
      throw new Error(`Failed to unsubscribe from ${symbol} ${interval} stream: ${error.message}`);
    }
  }

  /**
   * Checks if a stream is active for a given symbol and interval
   */
  isStreamActive(symbol: string, interval: string): boolean {
    const streamKey = this.generateStreamKey(symbol, interval);
    return this.activeStreams.has(streamKey);
  }

  /**
   * Handles incoming kline updates from WebSocket
   */
  private async handleKlineUpdate(streamKey: string, data: WebSocketKlineData['data'][0]): Promise<void> {
    const symbolData = this.symbolData.get(streamKey);
    if (!symbolData) return;

    // Add new candle
    const newCandle: Candle = {
      startTime: new Date(data.start).toISOString(),
      openPrice: data.open,
      highPrice: data.high,
      lowPrice: data.low,
      closePrice: data.close,
      volume: data.volume,
      turnover: data.turnover,
    };

    symbolData.candles.push(newCandle);

    // Keep only last 300 candles
    symbolData.candles = symbolData.candles.slice(-300);

    // Process candle and check for signals
    const { signal, newHistogramAbs, newSmaVolumes } = await this.signalGenerator.processCandle(
      symbolData.symbol,
      symbolData.candles,
      symbolData.prevHistogramAbs,
      symbolData.smaVolumes,
    );

    // Update symbol data
    symbolData.prevHistogramAbs = newHistogramAbs;
    symbolData.smaVolumes = newSmaVolumes;

    if (signal) {
      // Find matching subscriptions
      const subscriptions = await this.subscriptionsService.findMatching(
        symbolData.symbol,
        symbolData.interval,
      );

      if (subscriptions.length > 0) {
        // Create signal
        const signal: Signal = {
          id: '', // Will be generated by the database
          symbol: symbolData.symbol,
          interval: symbolData.interval,
          type: 'long', // Default to long for now
          entryPrice: parseFloat(data.close),
          takeProfit: 1.0, // Default take profit
          status: 'active',
          maxProfit: 0,
          notified: false,
          timestamp: Date.now(),
          validityHours: 24, // Default validity period
          profitLoss: 0,
          messageId: 0, // Initialize to 0, will be updated when message is sent
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await this.signalsService.createSignal(signal);
      }
    }
  }
} 