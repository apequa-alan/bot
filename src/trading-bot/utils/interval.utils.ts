import { KlineIntervalV3 } from 'bybit-api';

/**
 * Supported intervals and their configurations
 */
export const SUPPORTED_INTERVALS = {
  '1m': { minutes: 1, profit: 0.6, validityHours: 1 },
  '3m': { minutes: 3, profit: 0.8, validityHours: 1 },
  '5m': { minutes: 5, profit: 1, validityHours: 1 },
  '15m': { minutes: 15, profit: 1.5, validityHours: 2 },
  '30m': { minutes: 30, profit: 2, validityHours: 2 },
  '1h': { minutes: 60, profit: 2.5, validityHours: 4 },
  '2h': { minutes: 120, profit: 3, validityHours: 8 },
  '4h': { minutes: 240, profit: 3.5, validityHours: 16 },
  '6h': { minutes: 360, profit: 4, validityHours: 32 },
  '1d': { minutes: 1440, profit: 5, validityHours: 96 },
  '1w': { minutes: 10080, profit: 8, validityHours: 168 },
  '1M': { minutes: 43200, profit: 10, validityHours: 720 },
} as const;

export const HIGHER_TIMEFRAME_MAP: Partial<
  Record<KlineIntervalV3, KlineIntervalV3>
> = {
  '1': '3',
  '3': '5',
  '5': '15',
  '15': '30',
  '30': '60',
  '60': '120',
  '120': '240',
  '240': '360',
  '360': 'D',
  D: 'W',
  W: 'M',
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
  const normalizedInterval = interval.toLowerCase() as SupportedInterval;
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
    profit: SUPPORTED_INTERVALS[normalizedInterval as SupportedInterval].profit,
    validityHours:
      SUPPORTED_INTERVALS[normalizedInterval as SupportedInterval]
        .validityHours,
  };
};
