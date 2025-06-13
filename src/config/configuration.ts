import { config } from 'dotenv';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Loads the appropriate environment file based on NODE_ENV
 * Tries to load .local variant first, falls back to regular env file if not found
 */
export const loadEnvironmentFile = (): void => {
  const environment = process.env.NODE_ENV || 'development';
  const envFile = `.env.${environment}`;
  const envFileLocal = `${envFile}.local`;

  // Try to load .local variant first, fall back to regular env file if not found
  const envPath = existsSync(join(process.cwd(), envFileLocal))
    ? envFileLocal
    : envFile;

  config({
    path: join(process.cwd(), envPath),
  });
};

loadEnvironmentFile();

export const configuration = () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    channelId: process.env.TELEGRAM_CHANNEL_ID,
  },
  bybit: {
    apiKey: process.env.BYBIT_API_KEY,
    apiSecret: process.env.BYBIT_API_SECRET,
  },
  trading: {
    interval: process.env.INTERVAL || '1m',
    fastPeriod: process.env.FAST_PERIOD || '12',
    slowPeriod: process.env.SLOW_PERIOD || '26',
    signalPeriod: process.env.SIGNAL_PERIOD || '9',
    volumeSmaSmoothingPeriod: process.env.VOLUME_SMA_SMOOTHING_PERIOD || '9',
  },
});
