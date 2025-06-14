## 🔧 PHASE 1 — Core Subscription Infrastructure

---

### ✅ **Task 1: Add Subscription Fields to User Entity**

* **Start:** Update `User` entity.
* **End:** `plan`, `subscriptionLimit`, `subscriptionExpiresAt` columns exist.
* **Details:**

  * `plan: enum('free', 'pro', 'premium')`
  * `subscriptionLimit: number`
  * `subscriptionExpiresAt: Date | null`
  * Add migration script.

---

### ✅ **Task 2: Initialize New Users with Free Plan**

* **Start:** When a user sends `/start`, check/create user.
* **End:** User gets `free` plan with `3` subscriptionLimit.
* **Details:**

  * Implement logic in `UsersService.createIfNotExists()`.
  * Default values from config (e.g., `PLAN_CONFIG.free`).

---

### ✅ **Task 3: Enforce Subscription Limit When Creating a Subscription**

* **Start:** In `SubscriptionsService.create()`, add user limit check.
* **End:** Reject if user has max active subscriptions.
* **Details:**

  * Use `count()` to get active subscriptions.
  * Return error if over limit (can trigger UX response).

---

## 🛒 PHASE 2 — Billing via Telegram Stars

---

### ✅ **Task 4: Add /buy Command to Show Plan Options**

* **Start:** Create Telegram `/buy` command handler.
* **End:** User sees buttons: Pro (150⭐), Premium (750⭐).
* **Details:**

  * `callback_data: buy_pro`, `buy_premium`.

---

### ✅ **Task 5: Implement Invoice Generation for Stars**

* **Start:** Handle `buy_pro` and `buy_premium` callbacks.
* **End:** Telegram sends payment request (invoice).
* **Details:**

  * Use `sendInvoice()` with Stars-based pricing.
  * Set `invoice_payload = 'pro'` or `'premium'`.
  * Add refund functionality:
    * Allow refunds within 7 days of payment
    * Add refund button in payment confirmation message
    * Handle refund process and update user's plan back to free
    * Update subscription limits and expiration date

---

### ✅ **Task 6: Handle successful_payment Event and Upgrade Plan**

* **Start:** On `successful_payment`, update user's plan.
* **End:** User's plan, limit, and expiry are updated.
* **Details:**

  * Use PLAN_CONFIG to set new values.
  * Set `subscriptionExpiresAt = now + 30 days`.
  * Update subscription limits based on plan.
  * Send confirmation message with:
    * New plan details
    * Updated subscription limit
    * Expiration date
    * Refund information (7-day policy)
  * Add refund button to confirmation message
  * Handle refund requests within 7 days

---

### ✅ **Task 7: Send Confirmation Message After Purchase**

* **Start:** After plan update.
* **End:** User receives a success message with expiry date.
* **Details:**

  * `✅ Premium plan activated until DD.MM.YYYY`.

---

## 🧠 PHASE 3 — UX Feedback & Automation

---

### ✅ **Task 8: Add /status Command to Show Plan and Limits**

* **Start:** Implement `/status` command.
* **End:** User sees:

  * Plan name
  * Subscription limit
  * Subscriptions used
  * Expiration date (if any)

---

### ✅ **Task 9: Auto-respond on Subscription Limit Exceeding**

* **Start:** When user hits max limit (from Task 3).
* **End:** Send message:

  * "You've reached your limit. Upgrade to Pro or Premium."
  * Include inline buttons for `/buy`.

---

### ✅ **Task 10: Cron Job to Downgrade Expired Subscriptions**

* **Start:** Create scheduled job that runs daily.
* **End:** Users with expired `pro`/`premium` plans get downgraded to `free`.
* **Details:**

  * Set plan = `'free'`
  * Limit = 3
  * `subscriptionExpiresAt = null`

---

## 📐 PHASE 4 — Configuration & Constants

---

### ✅ **Task 11: Centralize Plan Metadata in Config**

* **Start:** Create constant `PLAN_CONFIG`.
* **End:** All limits/prices/durations are read from one place.

```ts
export const PLAN_CONFIG = {
  free:    { limit: 3,    priceStars: 0,   durationDays: Infinity },
  pro:     { limit: 30,   priceStars: 150, durationDays: 30 },
  premium: { limit: 300,  priceStars: 750, durationDays: 30 }
}
```

---

## 🧪 Final Testing Tasks

---

### ✅ **Task 13: Test Each Plan Path End-to-End**

* Test:

  * User on `free` plan hitting 3-sub limit
  * Upgrading to `pro` via Stars → 30-sub limit
  * Upgrading to `premium` via Stars → 300-sub limit

---

### ✅ **Task 14: Test Downgrade on Expiry**

* Set `subscriptionExpiresAt` to yesterday → run Cron.
* Ensure user is downgraded.

---

Let me know if you want this as a markdown `.md` file or a JSON list to feed directly into a task manager.
