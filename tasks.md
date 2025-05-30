Цель — эффективно сопоставить сигнал с подписками и отправить его нужным пользователям, избегая дубликатов, ошибок и обеспечивая масштабируемость.

✅ PHASE 4: Signal-to-User Matching and Delivery
Отправка сигнала только тем пользователям, которые подписаны на соответствующий symbol + interval.
 Архитектура: Обновлённый поток
text
Копировать
Редактировать
[ TradingBotService ]
    └─ onSignalGenerated(signal) ──▶ broadcastSignal(signal)

[ SignalMonitorService ]
    └─ checksPriceUpdate() ──▶ updateSignalStatus(signal)
                              └─▶ notifyUsers(signalUpdate)
🔁 Интеграция подписок — пошаговый план
Step 1: Встроить broadcastSignal(signal) в общую логику генерации сигнала
Start: Сигналы создаются, но рассылка только общая или отсутствует.

End: При создании сигнала вызывается broadcastSignal(signal).

В TradingBotService:

ts
Копировать
Редактировать
await this.signalsService.create(signal); // сохраняем сигнал
await this.signalBroadcastService.broadcastSignal(signal); // отправляем всем подписанным
Step 2: В broadcastSignal учесть персональный takeProfit
Уже реализовано ранее, просто подтвердим: sub.takeProfit ?? defaultProfit.

Step 3: Встроить подписки в SignalMonitorService (отслеживание TP)
Когда происходит обновление цены — проверяется: был ли достигнут TP? Если да → отправить обновление только тем, кто подписан.

ts
Копировать
Редактировать
const activeSignals = await this.signalsService.getActiveSignals();

for (const signal of activeSignals) {
  const price = getCurrentPrice(signal.symbol);

  const { profit: defaultProfit } = getDefaultSignalConfig(signal.interval);
  const subscribers = await this.subscriptionsService.getActiveSubscribersForSymbolInterval(signal.symbol, signal.interval);

  for (const sub of subscribers) {
    const profitPercent = sub.takeProfit ?? defaultProfit;
    const targetPrice = calculateTakeProfit(signal.entryPrice, profitPercent, signal.type);

    if (signal.type === 'long' && price >= targetPrice ||
        signal.type === 'short' && price <= targetPrice) {
      await this.signalsService.markAsSuccess(signal.id);

      const message = `✅ Signal hit take profit!\nSymbol: ${signal.symbol}\nEntry: ${signal.entryPrice}\nTP: ${targetPrice}`;
      await this.telegramService.sendMessageToUser(sub.userId, message);
    }
  }
}
Step 4: Не дублировать обновление сигналов
Добавь защиту от повторной отправки, например: поле notified = true.

После отправки обновляй notified = true в сигнале.

Проверять expiration
В SignalMonitorService добавь:

ts
Копировать
Редактировать
if (Date.now() > signal.exitTimestamp) {
  await this.signalsService.markAsFailure(signal.id);
  // optionally notify users if you want
}
