export const calculateEMA = (data: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  // Инициализируем EMA первым значением (можно заменить на SMA первых period элементов для большей точности)
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

  // Расчёт EMA для короткого и длинного периодов
  const emaShort = calculateEMA(closingPrices, shortPeriod);
  const emaLong = calculateEMA(closingPrices, longPeriod);

  // MACD линия = EMA (короткий период) - EMA (длинный период)
  const macdLine: number[] = [];
  for (let i = 0; i < closingPrices.length; i++) {
    macdLine.push(emaShort[i] - emaLong[i]);
  }

  // Сигнальная линия = EMA от MACD линии
  const signalLine = calculateEMA(macdLine, signalPeriod);

  // Гистограмма = MACD линия - сигнальная линия
  const histogram: number[] = [];
  for (let i = 0; i < closingPrices.length; i++) {
    histogram.push(macdLine[i] - signalLine[i]);
  }

  return {
    macdLine,
    signalLine,
    histogram,
  };
};
