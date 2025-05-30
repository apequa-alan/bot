Perfect — breaking the MVP into atomic, testable engineering tasks is a smart move for iteration and quality. Here’s your **granular, step-by-step MVP build plan**, using the existing architecture and focusing first on the **Telegram subscription input and signal matching** system.

---

# 🧱 MVP GOAL:

> A Telegram user sends a symbol and interval (e.g. `SUIUSDT 15m`). This is saved as a subscription. When a new signal is generated that matches the symbol and interval, the user gets notified.

---

## ✅ PHASE 1: Setup Subscription Input via Telegram

### **1. Create Subscription Entity (TypeORM)**

* **Start**: Subscription model not defined.
* **End**: A TypeORM entity exists with `id`, `userId`, `symbol`, `interval`, `takeProfit`, `active`.

---

### **2. Generate DB Migration for Subscription Table**

* **Start**: Subscription table not in database.
* **End**: Migration is applied and subscription table exists.

---

### **3. Implement SubscriptionsRepository**

* **Start**: No data access layer.
* **End**: Exports standard CRUD methods (`findOne`, `save`, `findActiveBySymbolAndInterval`).

---

### **4. Create SubscriptionsService with createOrUpdateSubscription()**

* **Start**: No service logic to store/update subscriptions.
* **End**: Method can insert or update an active subscription by `userId+symbol+interval`.

---

### **5. Parse Telegram Message for Symbol + Interval**

* **Start**: Telegram bot receives all messages as plain text.
* **End**: Bot can extract symbol and interval from message like: `SUIUSDT 15m`.

---

### **6. Normalize Interval (15m → 15, 1h → 60, etc.)**

* **Start**: Raw string intervals.
* **End**: Normalized to match system format (from config).

---

### **7. Call SubscriptionsService from TelegramService**

* **Start**: Telegram does nothing with parsed input.
* **End**: Telegram passes data to SubscriptionsService and sends confirmation.

---

### **8. Validate Input and Handle Errors**

* **Start**: Bot assumes input is correct.
* **End**: Bot handles invalid input and notifies user accordingly.

---

## ✅ PHASE 2: Signal Broadcast to Subscribers

### **9. Create getSubscribersForSignal(symbol, interval)**

* **Start**: No logic to fetch matching subscribers.
* **End**: SubscriptionsService can return userIds for a given `symbol + interval`.

---

### **10. Add subscriber lookup to SignalBroadcastService**

* **Start**: Signals are broadcast to channel only.
* **End**: Subscribers are fetched and messaged privately.

---

### **11. Format personalized signal message**

* **Start**: Messages are generic or static.
* **End**: Telegram message includes `entry price`, `symbol`, `type`, `takeProfit`.

---

### **12. Send message to each userId via TelegramService**

* **Start**: No 1:1 user messaging.
* **End**: Each subscriber receives a message for matching signal.

---

### **13. Handle Telegram API errors per-user**

* **Start**: All errors crash or are ignored.
* **End**: Graceful error logging + continue processing next user.

---

## ✅ PHASE 3: Verification and Testing

### **14. Create script to insert fake signal (manually or mocked)**

* **Start**: Can’t test signal matching.
* **End**: One command or test inserts a fake signal into DB or memory.

---

### **15. Run test: user subscribes + receives fake signal**

* **Start**: Only components tested in isolation.
* **End**: Simulated end-to-end test from Telegram → DB → signal → user notification.

---

### **16. Optional: Add `/subscriptions` command**

* **Start**: No user feedback on subscriptions.
* **End**: Bot replies with current active subscriptions for user.

---

## ✅ DONE = MVP

Once complete, you’ll have:

* Telegram interface for subscriptions
* Active subscription tracking
* Signal-to-user delivery

---

Would you like this broken down into a machine-readable format like JSON or YAML for task scheduling?
