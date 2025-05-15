/**
 * Utility functions for formatting messages for Telegram's MarkdownV2
 */

/**
 * Escapes special characters for Telegram's MarkdownV2 format
 * @param text The text to escape
 * @returns Escaped text safe for MarkdownV2
 */
export const escapeMarkdownV2 = (text: string): string => text.replace(/\\/g, '\\\\').replace(/([_*[\]()~`>#+=|{}.!-])/g, '\\$1')

/**
 * Formats a number for Telegram MarkdownV2
 * @param num The number to format
 * @returns Formatted number string
 */
export const formatNumberForMarkdown = (num: number): string => {
  return escapeMarkdownV2(num.toFixed(2));
};

/**
 * Formats a percentage for Telegram MarkdownV2
 * @param num The percentage to format
 * @returns Formatted percentage string with parentheses
 */
export const formatPercentageForMarkdown = (num: number): string => {
  return `\\(${escapeMarkdownV2(num.toFixed(2))}%\\)`;
};

/**
 * Formats a trading symbol for Telegram MarkdownV2
 * @param symbol The trading symbol to format
 * @returns Formatted symbol string
 */
export const formatSymbolForMarkdown = (symbol: string): string => {
  return escapeMarkdownV2(symbol);
};

/**
 * Formats a list of symbols for Telegram MarkdownV2
 * @param symbols Array of symbols to format
 * @returns Formatted symbols string
 */
export const formatSymbolsListForMarkdown = (symbols: string[]): string => {
  if (symbols.length === 0) return 'нет';
  return escapeMarkdownV2(symbols.join(', '));
};

/**
 * Formats an error message for Telegram MarkdownV2
 * @param error The error to format
 * @returns Formatted error message
 */
export const formatErrorForMarkdown = (error: unknown): string => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return escapeMarkdownV2(errorMessage);
};

/**
 * Formats a section header for Telegram MarkdownV2
 * @param text The header text
 * @returns Formatted header with bold markdown
 */
export const formatHeaderForMarkdown = (text: string): string => {
  return `*${escapeMarkdownV2(text)}:*`;
}; 