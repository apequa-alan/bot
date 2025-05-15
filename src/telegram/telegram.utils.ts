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
  