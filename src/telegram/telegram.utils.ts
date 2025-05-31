/**
 * Utility functions for formatting messages for Telegram's MarkdownV2
 */

/**
 * Escapes special characters for Telegram's MarkdownV2 format
 * @param text The text to escape
 * @returns Escaped text safe for MarkdownV2
 */
export const escapeMarkdownV2 = (text: string): string => {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([_*[\]()~`>#+=|{}.!-])/g, '\\$1');
};

/**
 * Formats a trading symbol for display
 * @param symbol The trading symbol to format
 * @returns Formatted symbol string
 */
export const formatSymbolForMarkdown = (symbol: string): string => {
  return escapeMarkdownV2(symbol);
};

/**
 * Formats a list of symbols for display
 * @param symbols Array of symbols to format
 * @returns Formatted symbols string
 */
export const formatSymbolsListForMarkdown = (symbols: string[]): string => {
  if (symbols.length === 0) return 'нет';
  return escapeMarkdownV2(symbols.join(', '));
};

/**
 * Formats an error message for display
 * @param error The error to format
 * @returns Formatted error message
 */
export const formatErrorForMarkdown = (error: unknown): string => {
  return escapeMarkdownV2(
    error instanceof Error ? error.message : String(error),
  );
};

/**
 * Formats a section header for display
 * @param text The header text
 * @returns Formatted header with bold markdown
 */
export const formatHeaderForMarkdown = (text: string): string => {
  return `*${escapeMarkdownV2(text)}*`;
};

/**
 * Normalizes a trading interval to minutes
 * @param interval The interval in minutes (e.g. '15', '60', '1440')
 * @returns Normalized interval in minutes
 * @throws Error if interval is not a valid number
 */
export const normalizeInterval = (interval: string): number => {
  const minutes = parseInt(interval, 10);
  if (isNaN(minutes) || minutes <= 0) {
    throw new Error(
      'Invalid interval format. Please provide a positive number of minutes (e.g. 15, 60, 1440)',
    );
  }
  return minutes;
};

/**
 * Parses a subscription message into symbol and interval
 * @param message The message to parse (e.g. 'SUIUSDT 15m')
 * @returns Object containing symbol and normalized interval
 * @throws Error if message format is invalid
 */
export const parseSubscriptionMessage = (
  message: string,
): { symbol: string; interval: string } => {
  const parts = message.trim().split(/\s+/);
  if (parts.length !== 2) {
    throw new Error('Invalid message format. Use format like: SUIUSDT 15m');
  }

  const [symbol, interval] = parts;

  // Validate symbol format (uppercase, no spaces)
  if (!/^[A-Z0-9]+$/.test(symbol)) {
    throw new Error(
      'Invalid symbol format. Use uppercase letters and numbers only',
    );
  }

  // Validate interval format
  if (!/^\d+[mhd]$/.test(interval)) {
    throw new Error(
      'Invalid interval format. Use format like: 15m, 1h, 4h, 1d',
    );
  }

  return { symbol, interval };
};
