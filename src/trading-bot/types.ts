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
  type: 'long' | 'short';
  status: 'active' | 'success' | 'failure';
  takeProfit?: number;
  stopLoss?: number;
  exitPrice?: number;
  profitLoss: number | null;
  maxProfit: number;
  notified: boolean;
  messageId: number;
  validityHours: number;
  timestamp: number;
  createdAt: Date;
  closedAt?: Date;
  updatedAt: Date;
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
