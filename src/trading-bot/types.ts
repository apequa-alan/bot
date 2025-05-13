export interface Candle {
  startTime: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
  turnover: string;
}

export interface SymbolData {
  symbol: string;
  candles: Candle[];
  smaVolumes: number[];
  prevHistogramAbs: number;
}

export interface WsKlineV5 {
  start: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  turnover: string;
  confirm: boolean;
  timestamp: number;
  cross_seq: number;
}

export interface Signal {
  symbol: string;
  entryPrice: number;
  entryTime: string;
  type: 'long' | 'short';
  active: boolean;
  maxProfit: number;
  notified: boolean;
  messageId: number;
  status?: 'success' | 'failure' | 'stopped' | 'active';
  takeProfit?: number;
  timestamp?: number;
  exitPrice?: number;
  exitTimestamp?: number;
  profitLoss?: number;
  validityHours: number;
}

export interface TimeframeConfig {
  profit: number;
  validityHours: number;
}

export interface SignalStats {
  symbol: string;
  success: number;
  failure: number;
  stopped: number;
  total: number;
  successRate: number;
  failureRate: number;
}
