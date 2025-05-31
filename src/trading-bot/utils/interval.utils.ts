import { KlineIntervalV3 } from 'bybit-api';

/**
 * Supported intervals and their configurations
 */
export const SUPPORTED_INTERVALS: Record<
  string,
  { klineInterval: KlineIntervalV3; profit: number; validityHours: number }
> = {
  '1m': { klineInterval: '1', profit: 0.6, validityHours: 1 },
  '3m': { klineInterval: '3', profit: 0.8, validityHours: 1 },
  '5m': { klineInterval: '5', profit: 1, validityHours: 1 },
  '15m': { klineInterval: '15', profit: 1.5, validityHours: 2 },
  '30m': { klineInterval: '30', profit: 2, validityHours: 2 },
  '1h': { klineInterval: '60', profit: 2.5, validityHours: 4 },
  '2h': { klineInterval: '120', profit: 3, validityHours: 8 },
  '4h': { klineInterval: '240', profit: 3.5, validityHours: 16 },
  '6h': { klineInterval: '360', profit: 4, validityHours: 32 },
  '1d': { klineInterval: 'D', profit: 5, validityHours: 96 },
  '1w': { klineInterval: 'W', profit: 8, validityHours: 168 },
  '1M': { klineInterval: 'M', profit: 10, validityHours: 720 },
} as const;

export const HIGHER_TIMEFRAME_MAP: Partial<
  Record<keyof typeof SUPPORTED_INTERVALS, KlineIntervalV3>
> = {
  '1m': '3',
  '3m': '5',
  '5m': '15',
  '15m': '30',
  '30m': '60',
  '1h': '120',
  '2h': '240',
  '4h': '360',
  '6h': 'D',
  '1d': 'W',
  '1w': 'M',
};

export type SupportedInterval = keyof typeof SUPPORTED_INTERVALS;

/**
 * Validates if the interval string is in the correct format and supported
 * @param interval The interval string to validate
 * @returns true if valid and supported, false otherwise
 */
export const isValidInterval = (interval: string): boolean => {
  return interval.toLowerCase() in SUPPORTED_INTERVALS;
};

/**
 * Validates and normalizes an interval string
 * @param interval The interval string to validate and normalize
 * @returns The normalized interval string
 * @throws Error if interval format is invalid or not supported
 */
export const validateAndNormalizeInterval = (interval: string): string => {
  const normalizedInterval = interval.toLowerCase();
  if (!isValidInterval(normalizedInterval)) {
    throw new Error(
      'Invalid interval format. Supported intervals: ' +
        Object.keys(SUPPORTED_INTERVALS).join(', '),
    );
  }
  return normalizedInterval;
};

/**
 * Gets the profit and validity hours for an interval
 * @param interval The interval string
 * @returns The profit and validity hours configuration
 * @throws Error if interval is not supported
 */
export const getIntervalConfig = (
  interval: string,
): { profit: number; validityHours: number } => {
  const normalizedInterval = validateAndNormalizeInterval(interval);
  return {
    profit: SUPPORTED_INTERVALS[normalizedInterval].profit,
    validityHours: SUPPORTED_INTERVALS[normalizedInterval].validityHours,
  };
};
