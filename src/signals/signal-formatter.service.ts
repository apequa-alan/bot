import { Injectable } from '@nestjs/common';
import { Signal } from './entities/signal.entity';

@Injectable()
export class SignalFormatterService {
  /**
   * Formats a signal into a readable message for display
   * @param signal The signal to format
   * @returns Formatted message string
   */
  public formatSignalMessage(signal: Signal): string {
    const { symbol, type, entryPrice, takeProfit, stopLoss, interval } = signal;
    
    const message = [
      `🔔 New ${type.toUpperCase()} Signal`,
      `Symbol: ${symbol}`,
      `Timeframe: ${interval}`,
      `Entry: ${entryPrice}`,
      takeProfit ? `Take Profit: ${takeProfit}` : '',
      stopLoss ? `Stop Loss: ${stopLoss}` : '',
    ].filter(Boolean).join('\n');

    return message;
  }

  /**
   * Formats an update message for a signal
   * @param signal The signal to format an update for
   * @returns Formatted update message string
   */
  public formatUpdateMessage(signal: Signal): string {
    const { symbol, type, status, profitLoss, entryPrice, exitPrice } = signal;
    
    const message = [
      `📊 Signal Update`,
      `Symbol: ${symbol}`,
      `Type: ${type.toUpperCase()}`,
      `Status: ${status.toUpperCase()}`,
      `Entry: ${entryPrice}`,
      exitPrice ? `Exit: ${exitPrice}` : '',
      profitLoss !== null ? `P/L: ${profitLoss.toFixed(2)}%` : '',
    ].filter(Boolean).join('\n');

    return message;
  }
} 