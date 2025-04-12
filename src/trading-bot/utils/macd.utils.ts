export const calculateEMA = (data: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  let ema = data[0];
  emaArray.push(ema);
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    emaArray.push(ema);
  }
  return emaArray;
};

export const calculateMACD = (
  closingPrices: number[],
  shortPeriod = 12,
  longPeriod = 26,
  signalPeriod = 9,
) => {
  if (closingPrices.length < longPeriod) {
    throw new Error('Недостаточно данных для расчёта MACD');
  }
  const emaShort = calculateEMA(closingPrices, shortPeriod);
  const emaLong = calculateEMA(closingPrices, longPeriod);
  const macdLine = emaShort.map((val, idx) => val - emaLong[idx]);
  const signalLine = calculateEMA(macdLine, signalPeriod);
  const histogram = macdLine.map((val, idx) => val - signalLine[idx]);
  return { macdLine, signalLine, histogram };
}; 