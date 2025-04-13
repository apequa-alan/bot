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
