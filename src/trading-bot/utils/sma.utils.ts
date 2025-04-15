export function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

export function calculateSmoothedSMA(
  prices: number[],
  period: number,
): number | null {
  if (prices.length < period * 2) return null;
  const firstSMA: (number | null)[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    firstSMA.push(calculateSMA(prices.slice(0, i + 1), period));
  }

  return calculateSMA(
    firstSMA.filter((val) => val !== null),
    period,
  );
}
