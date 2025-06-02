export function formatErrorForHtml(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `<code>${errorMessage}</code>`;
}

export function parseSubscriptionMessage(message: string): {
  symbol: string;
  interval: string;
} {
  const parts = message.trim().split(/\s+/);
  if (parts.length !== 2) {
    throw new Error('Invalid message format. Use: SYMBOL INTERVAL');
  }
  return {
    symbol: parts[0].toUpperCase(),
    interval: parts[1].toLowerCase(),
  };
}
