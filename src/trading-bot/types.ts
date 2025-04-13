export interface Candle {
  startTime: string;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  closePrice: string;
  volume: string;
  turnover?: string;
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
