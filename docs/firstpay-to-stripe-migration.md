# FirstPay to Stripe Migration Plan

> **Created**: 2026-04-04
> **Purpose**: Complete reference for migrating payment gateway from FirstPay to Stripe
> **Status**: Planning Phase

---

## Table of Contents

1. [Current FirstPay Integration Map](#1-current-firstpay-integration-map) — 17 files, all functions & flows
2. [Stripe Replacement Strategy](#2-stripe-replacement-strategy) — concepts, products/prices, webhooks, logic gap decisions
3. [Admin Settings Changes](#3-admin-settings-changes) — UI fields, type changes, secret names
4. [Device Model Changes (productId / priceId)](#4-device-model-changes) — new fields, subscription model, user profile
5. [Implementation Phases](#5-implementation-phases) — 6 phases with file-level detail

---

## 1. Current FirstPay Integration Map

### 1.1 Files That Reference FirstPay

| # | File | Role | Lines of Code |
|---|------|------|--------------|
| 1 | `src/lib/firstpay.ts` | Client-side API library (widget, tokenize, charge, recurring) | 386 |
| 2 | `src/lib/secret-actions.ts` | Server action to read/write FirstPay secrets | 142 |
| 3 | `src/lib/secret-manager.ts` | Google Cloud Secret Manager wrapper + SECRET_NAMES constants | 94 |
| 4 | `src/app/payment/[paymentLinkId]/page.tsx` | Payment page (widget init, charge/recurring flow) | 412 |
| 5 | `src/app/admin/settings/page.tsx` | Admin settings (FirstPay API keys, mode toggle, connection test) | ~200 |
| 6 | `src/app/admin/payments/page.tsx` | Subscription list, sync status, stop recurring | ~200 |
| 7 | `src/app/admin/payments/[subscriptionId]/history/page.tsx` | Payment execution history, refund UI | ~250 |
| 8 | `functions/src/index.ts` | Cloud Functions: getPaymentData, syncPaymentData, stopRecurringPayment, refundPayment, getPaymentHistory | ~850 |
| 9 | `functions/.env.local` | Test credentials (FIRSTPAY_APIKEY, FIRSTPAY_BEARERTOKEN) | 3 |
| 10 | `src/types/index.ts` | Type definitions (Device, UserProfile converters) | referenced |
| 11 | `src/types.ts` | Type definitions (UserProfile.customerId, Subscription.customerId, GlobalSettings comment) | 3 lines |
| 12 | `src/app/admin/page.tsx` | Admin dashboard — FirstPay warning message, nav card description | ~3 lines |
| 13 | `src/app/admin/payment-viewer/page.tsx` | Payment viewer — customerId, paymentId, recurringId display & search | ~200 |
| 14 | `docs/backend.json` | Backend documentation referencing FirstPay credentials | referenced |
| 15 | `docs/collections-reference.md` | Collection field docs — 8 FirstPay references (customerId, recurringId, paymentId, secrets) | referenced |
| 16 | `docs/workflow.md` | Workflow docs — 13 FirstPay references (payment flow, Cloud Functions table, secrets) | referenced |
| 17 | `CLAUDE.md` | Project guide — Secrets Management section references FirstPay | ~2 lines |

### 1.2 FirstPay Functions Detail

#### A. Client-Side Library (`src/lib/firstpay.ts`)

```
getFirstPayConfig(db)          → Reads mode from Firestore, credentials from Secret Manager
loadWidgetScript(mode)         → Dynamically loads FirstPay widget JS (UMD)
initWidget(element, cred, mode, phone) → Initializes card input widget on DOM element
publishWidgetToken(widget, phone)      → Publishes card token from widget
poll3dsStatus(config, cardToken)       → Polls 3DS auth status (300 attempts, 2s interval)
registerCustomer(config, data)         → POST /customer — registers customer with card
updateCustomer(config, id, token)      → PUT /customer/{id} — updates card token
createCharge(config, data)             → POST /charge — one-time payment
createRecurring(config, data)          → POST /recurring — monthly subscription
```

**API Endpoints:**
- Production: `https://www.api.firstpay.jp`
- Test: `https://dev.api.firstpay.jp`
- Widget JS: `https://www.widget.firstpay.jp/client.umd.cjs` (or dev subdomain)

#### B. Cloud Functions (`functions/src/index.ts`)

```
getPaymentData(mode, data)
  → GET /charge                           (all payments)
  → GET /charge/{paymentId}               (single payment)
  → GET /recurring/{recurringId}/history   (recurring history)

syncPaymentData()
  → GET /recurring/{recurringId}           (sync recurring status)
  → GET /charge/{paymentId}               (sync charge status)
  + Auto-expire subscriptions past endAt
  + Send renewal reminders 1 month before expiry
  + Release devices and notify waitlist on expiration

stopRecurringPayment(subscriptionId)
  → DELETE /recurring/{recurringId}
  + Set subscription status to 'canceled'
  + Release device, notify waitlist

refundPayment(subscriptionId, paymentId, historyId, type)
  → POST /refund/{paymentId}                                    (charge refund)
  → PUT /recurring/{recurringId}/history/{historyId}/refund      (recurring refund)
  + Records refund in Firestore

getPaymentHistory(subscriptionId)
  → GET /charge/{paymentId}               (initial charge)
  → GET /recurring/{recurringId}           (recurring details)
  → GET /recurring/{recurringId}/history   (execution history)
```

#### C. Admin Dashboard (`src/app/admin/page.tsx`)

```
Line 251: Comment — "FirstPay configuration check is now done via Secret Manager."
Line 259: Nav card description — "決済状況の確認・FirstPay同期"
Line 311: Warning text — "FirstPayのAPIキーが設定されていないため、ユーザーが決済を行うことができません。"
```

These need to be updated to reference Stripe instead.

#### D. Payment Page Flow (`src/app/payment/[paymentLinkId]/page.tsx`)

```
1. Load PaymentLink doc from Firestore
2. getFirstPayConfig(db) → get API credentials
3. loadWidgetScript() → inject FirstPay widget JS
4. initWidget() → render card input form
5. User clicks "決済を確定する"
6. publishWidgetToken() → get cardToken
7. registerCustomer() → create/update customer
8. payType === 'full'  → createCharge()
   payType === 'monthly' → createRecurring()
9. Create subscription doc in Firestore
10. Update device, paymentLink, application statuses
```

#### E. Secrets in Google Cloud Secret Manager

```
FIRSTPAY_TEST_API_KEY
FIRSTPAY_TEST_BEARER_TOKEN
FIRSTPAY_PROD_API_KEY
FIRSTPAY_PROD_BEARER_TOKEN
```

#### F. Firestore Fields (FirstPay-specific)

**subscriptions collection:**
- `customerId` — FirstPay customer ID (e.g., "CUST-abc12345-1234567890")
- `paymentId` — FirstPay charge ID (for one-time, e.g., "PAY1234567890")
- `recurringId` — FirstPay recurring ID (for monthly, e.g., "REC1234567890")
- `firstpayRecurringStatus` — { isActive, nextRecurringAt, payAmount, cycle, remainingExecutionNumber, lastSyncedAt }
- `firstpayPaymentStatus` — { paymentStatus, amount, lastSyncedAt }
- `refundHistory` — array of refund records with apiResponse

**users collection:**
- `customerId` — FirstPay customer ID (stored when first payment completes)

---

## 2. Stripe Replacement Strategy

### 2.1 Stripe Equivalent Concepts

| FirstPay Concept | Stripe Equivalent | Notes |
|-----------------|-------------------|-------|
| Customer registration (POST /customer) | `stripe.customers.create()` | Stripe Customer object |
| Card tokenization (widget JS) | **Stripe Elements** / `@stripe/stripe-js` | Stripe.js + Elements for PCI compliance |
| One-time charge (POST /charge) | `stripe.paymentIntents.create()` | PaymentIntent API |
| Recurring payment (POST /recurring) | `stripe.subscriptions.create()` | Stripe Subscriptions API |
| Stop recurring (DELETE /recurring/{id}) | `stripe.subscriptions.cancel()` | Cancel subscription |
| Refund (POST /refund/{id}) | `stripe.refunds.create()` | Refund API |
| 3DS Authentication | Built into Stripe Elements | Automatic with PaymentIntent |
| Widget JS (card input) | `<CardElement>` or `<PaymentElement>` | React components from `@stripe/react-stripe-js` |
| API Key + Bearer Token | **Publishable Key** (frontend) + **Secret Key** (backend) | 2 keys instead of 4 |

### 2.2 Stripe Subscription Model (Critical Difference)

Stripe requires **Products** and **Prices** to be created on the Stripe platform before subscriptions can be made.

```
Stripe Product  → represents the rental offering (e.g., "TimeWaver Mobile 3-month rental")
Stripe Price    → represents the pricing (e.g., ¥15,000/month, recurring)
```

**Each device rental plan needs:**
- A **Product** on Stripe (can be shared across devices of the same type)
- A **Price** on Stripe for each payment term/type combination

**Example for one device type "TimeWaver Mobile":**
```
Product: "TimeWaver Mobile Rental"
  Price 1: ¥15,000/month (monthly, for 3m plan)
  Price 2: ¥14,000/month (monthly, for 6m plan)
  Price 3: ¥12,000/month (monthly, for 12m plan)
  Price 4: ¥42,000 one-time (full, for 3m plan)
  Price 5: ¥78,000 one-time (full, for 6m plan)
  Price 6: ¥130,000 one-time (full, for 12m plan)
```

### 2.3 New Fields Required on Device Model

The current `Device` interface needs new fields to link to Stripe:

```typescript
interface Device {
  // ... existing fields ...

  // NEW: Stripe integration fields
  stripeProductId?: string;  // Stripe Product ID (e.g., "prod_xxxxx")
  stripePriceIds?: {
    "3m": { full?: string; monthly?: string };   // Stripe Price IDs
    "6m": { full?: string; monthly?: string };
    "12m": { full?: string; monthly?: string };
  };
}
```

**Options for creating Products/Prices:**
1. **Manual** — Admin creates them in Stripe Dashboard, copies IDs into platform
2. **Programmatic** — Platform creates them via `stripe.products.create()` + `stripe.prices.create()` when admin saves device
3. **Hybrid (Recommended)** — Platform creates/syncs automatically, but admin can override

### 2.4 What Changes in Admin Settings

**Remove:**
- FirstPay Test API Key
- FirstPay Test Bearer Token
- FirstPay Prod API Key
- FirstPay Prod Bearer Token
- FirstPay connection test

**Add:**
- Stripe Publishable Key (Test)
- Stripe Secret Key (Test)
- Stripe Publishable Key (Live)
- Stripe Secret Key (Live)
- Stripe Webhook Secret (for receiving events like payment success, failure, etc.)
- Stripe connection test (verify keys)

**Secrets in Secret Manager (new):**
```
STRIPE_TEST_PUBLISHABLE_KEY
STRIPE_TEST_SECRET_KEY
STRIPE_LIVE_PUBLISHABLE_KEY
STRIPE_LIVE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

### 2.5 Stripe Webhook (New Concept)

FirstPay relied on polling/manual sync. Stripe uses **webhooks** for real-time event delivery.

**Required webhook events:**
- `invoice.payment_succeeded` — monthly payment went through
- `invoice.payment_failed` — monthly payment failed
- `customer.subscription.updated` — subscription status changed
- `customer.subscription.deleted` — subscription canceled
- `charge.refunded` — refund processed

This replaces the need for `syncPaymentData()` polling. A new Cloud Function will handle incoming webhook events.

### 2.6 Stripe-Specific Logic Gaps (FirstPay → Stripe Mapping Decisions)

The following FirstPay behaviors have no direct 1:1 Stripe equivalent and require architectural decisions during implementation:

#### A. `maxExecutionNumber` — Limiting Subscription Duration

FirstPay's `createRecurring` accepts `maxExecutionNumber` to cap monthly charges (e.g., 12 for a 12-month plan). Stripe subscriptions don't have this parameter natively.

**Stripe solution:**
- Set `cancel_at` (Unix timestamp) when creating the subscription:
  ```typescript
  stripe.subscriptions.create({
    customer: 'cus_xxx',
    items: [{ price: 'price_xxx' }],
    cancel_at: Math.floor(endDate.getTime() / 1000), // auto-cancel at contract end
  });
  ```
- The subscription auto-cancels at the specified date, achieving the same effect as `maxExecutionNumber`.

#### B. `currentlyPayAmount` — Different First Payment Amount

FirstPay's `createRecurring` has `currentlyPayAmount` for the first charge (can differ from `payAmount` for subsequent months). Stripe handles this differently.

**Stripe solution:**
- Use `add_invoice_items` on subscription creation to adjust the first invoice:
  ```typescript
  stripe.subscriptions.create({
    customer: 'cus_xxx',
    items: [{ price: 'price_xxx' }],  // standard monthly price
    add_invoice_items: [{              // one-time adjustment on first invoice
      price_data: {
        currency: 'jpy',
        product: 'prod_xxx',
        unit_amount: firstPaymentDifference,
      },
    }],
  });
  ```
- Alternatively, create a separate `PaymentIntent` for the initial charge, then start the subscription from the next billing cycle using `billing_cycle_anchor`.

#### C. Module Add-On Pricing Strategy

Currently, `module-pricing.ts` dynamically calculates the total monthly amount (base device price + module add-ons). With FirstPay, this calculated amount is passed directly as `payAmount`. With Stripe, subscriptions are tied to predefined `Price` objects.

**Two approaches:**

1. **Dynamic Prices (Recommended for this platform):**
   - Create Stripe Prices on-the-fly at payment time using `stripe.prices.create()` with the exact calculated amount.
   - Pros: Supports any module combination without pre-creating every permutation.
   - Cons: Creates many Price objects on Stripe (but Stripe handles this fine).
   ```typescript
   const totalMonthly = calculateTotalMonthly(baseMonthly, selectedModules, moduleBasePrice);
   const price = await stripe.prices.create({
     product: device.stripeProductId,
     unit_amount: totalMonthly,
     currency: 'jpy',
     recurring: { interval: 'month' },
   });
   ```

2. **Fixed Prices (only for base device price):**
   - Use `stripePriceIds` on Device for base pricing only.
   - Add module charges as separate `subscription_items` line items.
   - Pros: Clean separation. Cons: More complex subscription structure.

**Decision**: Approach 1 (dynamic prices) is recommended because the current system already calculates the final amount in `module-pricing.ts` and passes it to FirstPay. The same flow works with Stripe — just create a Price object with that amount.

#### D. Subscription Cancellation Strategy

FirstPay `DELETE /recurring/{id}` immediately stops all future charges. Stripe offers two cancellation modes:

- **Immediate** (`stripe.subscriptions.cancel(id)`) — cancels now, no more billing
- **At period end** (`stripe.subscriptions.update(id, { cancel_at_period_end: true })`) — cancels at the end of the current billing period

**Decision**: Use **immediate cancellation** to match current FirstPay behavior. The `stopRecurringPayment` function currently does an immediate DELETE, and the admin UI expects instant effect. If "cancel at period end" is needed in the future, it can be added as a separate option.

#### E. `payType` Value Inconsistency (Pre-existing Bug)

There is an inconsistency between TypeScript type definitions and actual Firestore data:

**`types.ts` defines (wrong):**
- `Subscription.payType` as `'monthly' | 'one-time'`
- `Application.payType` as `'monthly' | 'one-time'`
- `PaymentLink.payType` as `'monthly' | 'one-time'`

**Firestore actual data (correct):**
- `applications` collection: `payType: "full"`
- `subscriptions` collection: `payType: "full"`
- `paymentLinks` collection: `payType: "full"`
- `src/app/payment/[paymentLinkId]/page.tsx` checks `paymentLink.payType === 'full'`

All three collections use `'monthly' | 'full'` in production. The `'one-time'` value in `types.ts` is never used.

**During migration**: Standardize all three type definitions in `types.ts` to `'monthly' | 'full'` (matching Firestore data and payment page logic).

---

## 3. Admin Settings Changes

### 3.1 Settings Page Updates

**Current payment section displays:**
```
[Switch] テストモード / 本番モード
[Input]  FirstPay テスト API Key          [設定済み/未設定]
[Input]  FirstPay テスト Bearer Token      [設定済み/未設定]
[Input]  FirstPay 本番 API Key            [設定済み/未設定]
[Input]  FirstPay 本番 Bearer Token        [設定済み/未設定]
[Button] 接続テスト
```

**New payment section should display:**
```
[Switch] テストモード / 本番モード
[Input]  Stripe テスト Publishable Key    [設定済み/未設定]
[Input]  Stripe テスト Secret Key         [設定済み/未設定]
[Input]  Stripe 本番 Publishable Key      [設定済み/未設定]
[Input]  Stripe 本番 Secret Key           [設定済み/未設定]
[Input]  Stripe Webhook Secret            [設定済み/未設定]
[Button] 接続テスト
```

### 3.2 Type Changes

**SecretPayload (secret-actions.ts):**
```typescript
// REMOVE
firstpayTestApiKey?: string;
firstpayTestBearerToken?: string;
firstpayProdApiKey?: string;
firstpayProdBearerToken?: string;

// ADD
stripeTestPublishableKey?: string;
stripeTestSecretKey?: string;
stripeLivePublishableKey?: string;
stripeLiveSecretKey?: string;
stripeWebhookSecret?: string;
```

**SECRET_NAMES (secret-manager.ts):**
```typescript
// REMOVE
FIRSTPAY_TEST_API_KEY
FIRSTPAY_TEST_BEARER_TOKEN
FIRSTPAY_PROD_API_KEY
FIRSTPAY_PROD_BEARER_TOKEN

// ADD
STRIPE_TEST_PUBLISHABLE_KEY
STRIPE_TEST_SECRET_KEY
STRIPE_LIVE_PUBLISHABLE_KEY
STRIPE_LIVE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

---

## 4. Device Model Changes

### 4.1 New Fields on Device Interface

```typescript
// In src/types/index.ts — Device interface
export interface Device {
  // ... existing fields unchanged ...

  // Stripe Product & Price linkage
  stripeProductId?: string;
  stripePriceIds?: {
    "3m": { full?: string; monthly?: string };
    "6m": { full?: string; monthly?: string };
    "12m": { full?: string; monthly?: string };
  };
}
```

### 4.2 Device Form Updates

The admin device form (`src/app/admin/devices/_components/device-form.tsx`) needs:
- Display `stripeProductId` (read-only or editable)
- Display `stripePriceIds` for each term (read-only or editable)
- Optionally: a "Sync to Stripe" button that auto-creates Product + Prices

### 4.3 Subscription Model Changes

```typescript
// Firestore subscription document
// REMOVE these FirstPay-specific fields:
//   customerId (FirstPay format)
//   paymentId (FirstPay charge ID)
//   recurringId (FirstPay recurring ID)
//   firstpayRecurringStatus
//   firstpayPaymentStatus

// ADD these Stripe fields:
//   stripeCustomerId       — Stripe Customer ID (cus_xxxxx)
//   stripeSubscriptionId   — Stripe Subscription ID (sub_xxxxx) for monthly
//   stripePaymentIntentId  — Stripe PaymentIntent ID (pi_xxxxx) for one-time
//   stripeStatus           — { status, currentPeriodEnd, cancelAt, lastSyncedAt }
```

### 4.4 User Profile Changes

```typescript
// UserProfile — replace customerId
// REMOVE: customerId (FirstPay customer ID)
// ADD:    stripeCustomerId (Stripe customer ID, e.g., "cus_xxxxx")
```

---

## 5. Implementation Phases

### Phase 1: Foundation (Infrastructure & Config)
**Estimated scope: 7 files**

1. Install Stripe packages:
   - `stripe` (server-side SDK) in `functions/package.json`
   - `@stripe/stripe-js` + `@stripe/react-stripe-js` in root `package.json`

2. Create `src/lib/stripe.ts` (replaces `firstpay.ts`):
   - `getStripeConfig(db)` — read mode + publishable key
   - `getStripeInstance()` — initialize Stripe.js (client-side)
   - Helper functions for server-side Stripe operations

3. Update `src/lib/secret-manager.ts`:
   - Replace FirstPay SECRET_NAMES with Stripe equivalents

4. Update `src/lib/secret-actions.ts`:
   - Replace `getFirstPaySecrets()` with `getStripeSecrets()`
   - Update `SecretPayload` type
   - Update `getSecretsStatus()` and `saveSecrets()`

5. Update `src/types/index.ts`:
   - Add `stripeProductId`, `stripePriceIds` to Device interface
   - Add `stripeCustomerId` to UserProfile
   - Update subscription-related types

6. Update `src/types.ts`:
   - Replace `UserProfile.customerId` → `stripeCustomerId`
   - Update `Subscription` interface: remove FirstPay fields, add Stripe fields
   - Normalize `Subscription.payType` to `'monthly' | 'full'` (fix inconsistency, see Section 2.6E)
   - Update comment on `GlobalSettings` (line 149) from "FirstPay" to "Stripe"

7. Update admin settings page:
   - Replace FirstPay key inputs with Stripe key inputs
   - Update connection test to verify Stripe keys

### Phase 2: Device & Product Sync
**Estimated scope: 3 files**

1. Add Stripe Product/Price creation logic:
   - Cloud Function or server action to create Stripe Products & Prices
   - Sync device pricing to Stripe when admin saves device

2. Update device form:
   - Add `stripeProductId` and `stripePriceIds` display/input fields
   - Add "Sync to Stripe" button

3. Update device converter in `types/index.ts`:
   - Include new Stripe fields in Firestore converter

### Phase 3: Payment Page (Core Flow)
**Estimated scope: 2 files**

1. Rewrite `src/app/payment/[paymentLinkId]/page.tsx`:
   - Replace FirstPay widget with Stripe Elements (`<PaymentElement>`)
   - Replace `registerCustomer` → `stripe.customers.create()`
   - Replace `updateCustomer` → `stripe.customers.update()` + `stripe.paymentMethods.attach()`
   - Replace `createCharge` → `stripe.paymentIntents.create()` (via Cloud Function)
   - Replace `createRecurring` → `stripe.subscriptions.create()` (via Cloud Function)
   - Remove 3DS polling (Stripe handles automatically)
   - Remove manual `customerId` generation (`CUST-{uid}-{timestamp}` format) — Stripe auto-generates `cus_xxxxx` IDs
   - Update Firestore writes to use Stripe IDs

2. Create new Cloud Function `createStripePayment`:
   - Accepts paymentLinkId
   - Creates Stripe Customer (or reuses existing via `stripeCustomerId` on UserProfile)
   - For one-time (`payType === 'full'`): creates `PaymentIntent`
   - For monthly (`payType === 'monthly'`):
     - Creates dynamic `Price` with calculated amount from `module-pricing.ts` (see Section 2.6C)
     - Creates `Subscription` with `cancel_at` set to contract end date (see Section 2.6A)
     - Handles initial payment amount if different via `add_invoice_items` (see Section 2.6B)
   - Returns `clientSecret` for frontend confirmation via Stripe Elements

### Phase 4: Cloud Functions (Backend Operations)
**Estimated scope: 1 file (functions/src/index.ts)**

1. **Replace `getPaymentData`**:
   - Use `stripe.charges.list()` / `stripe.paymentIntents.retrieve()`
   - Use `stripe.subscriptions.retrieve()` / `stripe.invoices.list()`

2. **Replace `syncPaymentData`**:
   - Primarily replaced by webhook handler
   - Keep manual sync as fallback using `stripe.subscriptions.list()`
   - Keep auto-expire and renewal reminder logic (unchanged)

3. **Replace `stopRecurringPayment`**:
   - Use `stripe.subscriptions.cancel(subscriptionId)` — immediate cancellation (see Section 2.6D)

4. **Replace `refundPayment`**:
   - Use `stripe.refunds.create({ payment_intent: piId })`

5. **Replace `getPaymentHistory`**:
   - Use `stripe.invoices.list({ subscription: subId })`
   - Use `stripe.charges.list({ payment_intent: piId })`

6. **NEW: `stripeWebhook` (HTTP function)**:
   - Verify webhook signature
   - Handle: `invoice.payment_succeeded`, `invoice.payment_failed`
   - Handle: `customer.subscription.updated`, `customer.subscription.deleted`
   - Handle: `charge.refunded`
   - Update Firestore subscription status in real-time

### Phase 5: Admin Payment Dashboard
**Estimated scope: 4 files**

1. Update `src/app/admin/page.tsx` (dashboard):
   - Change nav card description from "FirstPay同期" to "Stripe同期"
   - Update warning message from "FirstPayのAPIキーが…" to Stripe equivalent
   - Update comment referencing FirstPay configuration check

2. Update `src/app/admin/payments/page.tsx`:
   - Replace `firstpayRecurringStatus` display with `stripeStatus`
   - Replace `firstpayPaymentStatus` display with Stripe equivalents
   - Rename `getFirstPaySyncBadge()` function → `getStripeSyncBadge()`
   - Update "FirstPay同期" button label → "Stripe同期"
   - Update confirmation dialog text (line 356: "FirstPay APIを通じて実行" → Stripe)
   - Update sync button to use new sync function
   - Update stop recurring to use Stripe cancellation

3. Update `src/app/admin/payments/[subscriptionId]/history/page.tsx`:
   - Update subtitle text (line 313: "FirstPay APIから取得した決済実行履歴" → Stripe)
   - Update "FirstPayステータス" label (line 379) → "Stripeステータス"
   - Update refund confirmation text (line 466: "FirstPay APIを通じて実行" → Stripe)
   - Fetch history from Stripe invoices/charges
   - Update refund flow to use Stripe refund API

4. Update `src/app/admin/payment-viewer/page.tsx`:
   - Replace `customerId` → `stripeCustomerId` in Subscription interface and display
   - Replace `paymentId` / `recurringId` → `stripePaymentIntentId` / `stripeSubscriptionId`
   - Update search filter to use new Stripe field names
   - Update display column showing payment/subscription IDs

### Phase 6: Cleanup & Testing
**Estimated scope: all files**

1. Remove `src/lib/firstpay.ts` entirely
2. Remove FirstPay-related environment variables from `functions/.env.local`
3. Remove FirstPay widget script references
4. Update documentation files:
   - `docs/blueprint.md` — line 8: replace FirstPay description with Stripe
   - `docs/workflow.md` — 13 references: payment flow (lines 49, 64), Cloud Functions table (lines 181-186), secrets table (lines 166-169), overview (lines 4, 106)
   - `docs/collections-reference.md` — 8 references: users.customerId (line 22), subscriptions fields (lines 96-101, 109-110), secrets table (lines 210-213)
   - `docs/backend.json` — lines 152, 165, 172: settings description and credential structure
5. Update `CLAUDE.md`:
   - Line 317: replace `getSecret('FIRSTPAY_PROD_API_KEY')` example with Stripe
   - Line 320: replace `FIRSTPAY_*` secret names with `STRIPE_*` in Known secrets list
6. Test full flow: device creation → application → payment → subscription → sync → cancel → refund
7. Verify webhook delivery and handling
8. Update Firestore security rules if needed

---

## Summary: Key Differences at a Glance

| Aspect | FirstPay | Stripe |
|--------|----------|--------|
| Card Input | Widget JS (UMD script injection) | Stripe Elements (React components) |
| Auth | API Key + Bearer Token (4 secrets) | Publishable Key + Secret Key + Webhook Secret (5 secrets) |
| 3DS | Manual polling (poll3dsStatus) | Automatic (built into Elements) |
| One-time Payment | POST /charge | PaymentIntent API |
| Subscription | POST /recurring (custom recurring) | Stripe Subscriptions (requires Product + Price) |
| Cancel | DELETE /recurring/{id} | stripe.subscriptions.cancel() — immediate (Section 2.6D) |
| Refund | POST /refund/{id} | stripe.refunds.create() |
| Status Sync | Manual polling (syncPaymentData) | Webhooks (real-time) + manual sync fallback |
| Products | Not required | **Required** — must create Product + Price on Stripe |
| New Device Fields | None | `stripeProductId`, `stripePriceIds` |
| Max Executions | `maxExecutionNumber` param | `cancel_at` timestamp on subscription (Section 2.6A) |
| First Payment | `currentlyPayAmount` param | `add_invoice_items` or separate PaymentIntent (Section 2.6B) |
| Module Pricing | Calculated amount passed as `payAmount` | Dynamic `Price` created at payment time (Section 2.6C) |

---

## Dependencies to Install

```bash
# Root package (frontend)
npm install @stripe/stripe-js @stripe/react-stripe-js

# Functions package (backend)
cd functions && npm install stripe
```

---

## Risk Notes

1. **Existing subscriptions**: Active FirstPay subscriptions cannot be migrated to Stripe. They must complete their term on FirstPay or be manually canceled.
2. **Customer data**: FirstPay customer IDs are not portable. New Stripe customers will be created.
3. **Webhook reliability**: Stripe webhooks need a publicly accessible endpoint. Cloud Functions HTTP trigger provides this.
4. **Module pricing**: The calculation logic in `module-pricing.ts` remains the same, but the result must now be used to create a dynamic Stripe `Price` object (see Section 2.6C).
5. **Payment link system**: The PaymentLink collection and flow can remain largely the same — only the payment processing step changes.
6. **payType inconsistency**: The `Subscription.payType` type definition (`'monthly' | 'one-time'`) doesn't match actual usage (`'monthly' | 'full'`). Must be normalized during migration (see Section 2.6E).
7. **Two type files**: Types are defined in both `src/types.ts` and `src/types/index.ts`. Both contain `customerId` references that need updating. Ensure changes are applied to both files.
