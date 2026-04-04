# Stripe Migration — Next Session Tasks

> **Created**: 2026-04-04
> **Updated**: 2026-04-04 (session 3 complete — webhook + price sync done)
> **Context**: Migration from FirstPay to Stripe is code-complete. E2E tests passed. Critical subscription items (#1-3) are now DONE. Remaining items are for production readiness.

---

## ~~Priority 1: Critical~~ ✅ DONE (Completed in Session 2)

### ~~1. Create Stripe Subscription After Monthly Payment Succeeds~~ ✅

**Problem**: Currently, monthly payments only charge the first month via `PaymentIntent`. No actual Stripe `Subscription` is created, so recurring billing doesn't happen.

**Fix**: After `confirmCardPayment` succeeds for monthly payType:
1. The card is saved on the Stripe Customer (via `setup_future_usage: 'off_session'`)
2. Call a new Cloud Function `createStripeSubscription` that:
   - Retrieves the customer's saved payment method
   - Sets it as the default payment method
   - Creates `stripe.subscriptions.create()` using `device.stripeProducts[term].monthlyPriceId`
   - Sets `billing_cycle_anchor` to next month (since 1st month already paid)
   - Returns `subscriptionId`
3. Save `stripeSubscriptionId` to the Firestore subscription doc

**Files to modify**:
- `functions/src/index.ts` — add `createStripeSubscription` function
- `src/app/payment/[paymentLinkId]/page.tsx` — call it after payment success

### ~~2. Fix Duplicate Product/Price Creation~~ ✅

**Problem**: `createStripePayment` creates a new dynamic `Price` + `Product` on every call for monthly payments. This creates duplicates on retries/page reloads.

**Fix**: Use the pre-created `device.stripeProducts[term].monthlyPriceId` instead of creating new prices dynamically.

**Flow change**:
```
Before: createStripePayment → stripe.prices.create() → stripe.paymentIntents.create()
After:  createStripePayment → read device.stripeProducts → stripe.paymentIntents.create()
```

**Files to modify**:
- `functions/src/index.ts` — update `createStripePayment` to read device's stripeProducts

### ~~3. Save Stripe IDs to Firestore Subscription Doc~~ ✅

**Problem**: `stripePaymentIntentId` and `stripeSubscriptionId` are null in Firestore after payment.

**Fix**:
- `createStripePayment` should return `paymentIntentId` in addition to `clientSecret`
- Payment page should save it to the subscription doc
- After subscription creation (task #1), save `stripeSubscriptionId` too

**Files to modify**:
- `functions/src/index.ts` — return `paymentIntentId` from `createStripePayment`
- `src/app/payment/[paymentLinkId]/page.tsx` — save IDs to subscription doc

---

## Priority 2: Important (For Reliable Operations)

### ~~4. Stripe Webhook Handler~~ ✅ (Session 3)

**Purpose**: Real-time payment status sync without manual "Stripe同期" clicks.

**Implementation**:
- Create `stripeWebhook` HTTP Cloud Function (not `onCall` — must be HTTP for Stripe)
- Verify webhook signature using `STRIPE_WEBHOOK_SECRET`
- Handle events:
  - `invoice.payment_succeeded` → update subscription status
  - `invoice.payment_failed` → notify admin
  - `customer.subscription.updated` → sync status
  - `customer.subscription.deleted` → mark canceled, release device
  - `charge.refunded` → record refund

**Files to create/modify**:
- `functions/src/index.ts` — add `stripeWebhook` HTTP function
- Stripe Dashboard → Webhooks → add endpoint URL

### ~~5. syncDeviceToStripe — Handle Price Changes~~ ✅ (Session 3)

**Problem**: When admin changes a device's monthly/full price, only Firestore is updated. Stripe still has the old Prices. Stripe Prices are immutable — amounts can't be changed after creation.

**Fix**: When device prices are updated:
1. Compare current Firestore prices vs amounts on existing Stripe Prices
2. If different: archive old Price → create new Price → update `device.stripeProducts`
3. Trigger on device save (both new and edit)

**Also needed**: Call `syncDeviceToStripe` on device **edit** (currently only called on new device creation).

**Files to modify**:
- `functions/src/index.ts` — update `syncDeviceToStripe` to handle existing prices
- `src/app/admin/devices/page.tsx` — call sync on edit save too (not just new)

---

## Priority 3: Cleanup

### 6. Archive Test Duplicate Products
- Go to Stripe Dashboard → Products
- Archive all "Monthly Rental: TimeWaver Frequency" duplicates
- Keep only the 3 correct products (TimeWaver Frequency - 3/6/12ヶ月プラン)

### ~~7. Update stripe-api-key-setup.md~~ ✅ (Session 3)
- Consolidated all 12 required permissions into single table
- Documented the `l` vs `1` publishable key gotcha

### 8. Deploy to Production (App Hosting)
- `git push origin main` to trigger App Hosting deploy
- Verify hosted URL works with Stripe test keys
- When ready for live: create live restricted key, enter in Admin Settings, toggle to production mode

---

## Current Architecture (Working)

```
Device Save (Admin)
  → syncDeviceToStripe() → Creates 3 Products + 6 Prices on Stripe
  → Saves stripeProducts to device doc
  → Also called on device edit — detects price changes, archives old, creates new ✅

Payment Flow — Full (One-time)
  → createStripePayment() → Creates PaymentIntent using device amount
  → Frontend: CardElement → confirmCardPayment()
  → Payment succeeds → Firestore subscription doc (with stripePaymentIntentId)

Payment Flow — Monthly (Recurring)
  → createStripePayment() → Creates PaymentIntent (1st month) + saves card
  → Frontend: CardElement → confirmCardPayment()
  → Payment succeeds → Firestore subscription doc (with stripePaymentIntentId)
  → createStripeSubscription() → Uses saved card + device monthlyPriceId ✅
  → Stripe auto-charges from next month
  → stripeSubscriptionId saved to Firestore ✅

Webhook (real-time sync):
  - stripeWebhook             ← NEW (HTTP endpoint for Stripe events) ✅
    URL: https://us-central1-studio-3681859885-cd9c1.cloudfunctions.net/stripeWebhook
    Events: invoice.payment_succeeded/failed, subscription.updated/deleted, charge.refunded

Cloud Functions Deployed (12 total):
  - createStripePayment      ← NEW (creates PI for payment)
  - createStripeSubscription  ← NEW (creates recurring after 1st payment)
  - syncDeviceToStripe        ← NEW (syncs device → Stripe, handles price changes)
  - stripeWebhook             ← NEW (HTTP webhook for real-time events)
  - getPaymentData            ← Updated (Stripe API)
  - getSubscriptionsList      ← Unchanged (Firestore only)
  - syncPaymentData           ← Updated (Stripe API)
  - stopRecurringPayment      ← Updated (Stripe cancel)
  - refundPayment             ← Updated (Stripe refund)
  - getPaymentHistory         ← Updated (Stripe invoices)
  - sendAdHocEmail            ← Unchanged
  - onApplicationUpdate       ← Unchanged
```
