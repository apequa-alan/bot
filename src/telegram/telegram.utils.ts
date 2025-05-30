/**
 * Utility functions for formatting messages for Telegram's MarkdownV2
 */

/**
 * Escapes special characters for Telegram's MarkdownV2 format
 * @param text The text to escape
 * @returns Escaped text safe for MarkdownV2
 */
export const escapeMarkdownV2 = (text: string): string => {
  return text.replace(/\\/g, '\\\\')
    .replace(/([_*[\]()~`>#+=|{}.!-])/g, '\\$1');
};

/**
 * Formats a number for display
 * @param num The number to format
 * @returns Formatted number string
 */
export const formatNumberForMarkdown = (num: number): string => {
  return num.toFixed(2);
};

/**
 * Formats a percentage for display
 * @param num The percentage to format
 * @returns Formatted percentage string
 */
export const formatPercentageForMarkdown = (num: number): string => {
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
};

/**
 * Formats a trading symbol for display
 * @param symbol The trading symbol to format
 * @returns Formatted symbol string
 */
export const formatSymbolForMarkdown = (symbol: string): string => {
  return symbol;
};

/**
 * Formats a list of symbols for display
 * @param symbols Array of symbols to format
 * @returns Formatted symbols string
 */
export const formatSymbolsListForMarkdown = (symbols: string[]): string => {
  if (symbols.length === 0) return 'нет';
  return symbols.join(', ');
};

/**
 * Formats an error message for display
 * @param error The error to format
 * @returns Formatted error message
 */
export const formatErrorForMarkdown = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

/**
 * Formats a section header for display
 * @param text The header text
 * @returns Formatted header with bold markdown
 */
export const formatHeaderForMarkdown = (text: string): string => {
  return `*${text}*`;
};

/**
 * Normalizes a trading interval to minutes
 * @param interval The interval to normalize (e.g. '15m', '1h', '4h', '1d')
 * @returns Normalized interval in minutes
 * @throws Error if interval format is invalid
 */
export const normalizeInterval = (interval: string): number => {
  const match = interval.match(/^(\d+)([mhd])$/);
  if (!match) {
    throw new Error('Invalid interval format. Use format like: 15m, 1h, 4h, 1d');
  }

  const [, value, unit] = match;
  const numValue = parseInt(value, 10);

  switch (unit) {
    case 'm':
      return numValue;
    case 'h':
      return numValue * 60;
    case 'd':
      return numValue * 60 * 24;
    default:
      throw new Error('Invalid interval unit. Use m (minutes), h (hours), or d (days)');
  }
};

/**
 * Parses a subscription message into symbol and interval
 * @param message The message to parse (e.g. 'SUIUSDT 15m')
 * @returns Object containing symbol and normalized interval
 * @throws Error if message format is invalid
 */
export const parseSubscriptionMessage = (message: string): { symbol: string; interval: string } => {
  const parts = message.trim().split(/\s+/);
  if (parts.length !== 2) {
    throw new Error('Invalid message format. Use format like: SUIUSDT 15m');
  }

  const [symbol, interval] = parts;
  
  // Validate symbol format (uppercase, no spaces)
  if (!/^[A-Z0-9]+$/.test(symbol)) {
    throw new Error('Invalid symbol format. Use uppercase letters and numbers only');
  }

  // Validate interval format
  if (!/^\d+[mhd]$/.test(interval)) {
    throw new Error('Invalid interval format. Use format like: 15m, 1h, 4h, 1d');
  }

  return { symbol, interval };
};
  