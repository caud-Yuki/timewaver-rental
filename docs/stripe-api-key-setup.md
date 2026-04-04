# Stripe API Key Setup Guide

> **Created**: 2026-04-04
> **Purpose**: Reference for creating Stripe API keys (test and live) for TWRENTAL-PLATFORM

---

## Key Types

| Key Type | Prefix | Usage |
|----------|--------|-------|
| Publishable Key | `pk_test_` / `pk_live_` | Frontend (Stripe Elements) — safe to expose in browser |
| Secret Key (Restricted) | `rk_test_` / `rk_live_` | Backend (Cloud Functions) — never expose to client |
| Webhook Secret | `whsec_` | Webhook signature verification |

**Recommendation**: Use **restricted keys** instead of standard secret keys (`sk_*`) for better security. Restricted keys limit access to only the APIs your platform needs.

---

## Creating a Restricted Secret Key

### Stripe Dashboard Path
`Developers` → `API Keys` → `制限付きのAPIキーの作成` (Create restricted API key)

### Key Name Convention
- Test: `rentalTimeWaver-YYYYMMDD` (e.g., `rentalTimeWaver-20260404`)
- Live: `rentalTimeWaver-live-YYYYMMDD`

### Required Permissions (All 12)

Set these resources to **書き込み** (Write — includes read access). Leave everything else as **なし** (None).

| # | Category | Resource | Permission | Reason |
|---|----------|----------|------------|--------|
| 1 | Core | **Customers** | 読み取り 書き込み | Create/update Stripe customers |
| 2 | Core | **Products** | 読み取り 書き込み | Create/manage rental products |
| 3 | Core | **Charges and Refunds** | 読み取り 書き込み | Process refunds |
| 4 | Core | **Payment Intents** | 読み取り 書き込み | One-time and first-month payments |
| 5 | Core | **Setup Intents** | 読み取り 書き込み | Save cards for recurring billing |
| 6 | Core | **Confirmation Token (client)** | 読み取り 書き込み | CardElement form rendering |
| 7 | Core | **Ephemeral keys** | 読み取り 書き込み | Stripe.js session management |
| 8 | Core | **Customer Session** | 読み取り 書き込み | CardElement customer context |
| 9 | Billing | **Prices** | 読み取り 書き込み | Create/archive prices per plan |
| 10 | Billing | **Subscriptions** | 読み取り 書き込み | Create/cancel monthly subscriptions |
| 11 | Billing | **Invoices** | 読み取り 書き込み | Payment history retrieval |
| 12 | Webhook | **Webhook Endpoints** | 読み取り 書き込み | Webhook management |

> **Note**: The `l` (lowercase L) vs `1` (digit one) in publishable keys can look identical in many fonts. Always copy-paste from Stripe dashboard — never type manually.

---

## Where to Store Keys

Keys are stored in **Google Cloud Secret Manager** (not in `.env` files or code).

### Secret Names in Secret Manager

| Secret Name | Value | Environment |
|-------------|-------|-------------|
| `STRIPE_TEST_PUBLISHABLE_KEY` | `pk_test_...` | Test |
| `STRIPE_TEST_SECRET_KEY` | `rk_test_...` (restricted) | Test |
| `STRIPE_LIVE_PUBLISHABLE_KEY` | `pk_live_...` | Production |
| `STRIPE_LIVE_SECRET_KEY` | `rk_live_...` (restricted) | Production |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Both |

### How to Enter Keys
1. Go to Admin Settings (`/admin/settings`)
2. Scroll to **Stripe 認証情報** section
3. Enter keys in the appropriate fields
4. Click **設定内容を保存**
5. Verify fields show **設定済み**

---

## Webhook Setup

### Stripe Dashboard Path
`Developers` → `Webhooks` → `エンドポイントを追加` (Add endpoint)

### Endpoint URL (Deployed)
```
https://us-central1-studio-3681859885-cd9c1.cloudfunctions.net/stripeWebhook
```
This function is already deployed and ready to receive events.

### Events to Listen For
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded`

### Webhook Secret
After creating the endpoint, copy the **Signing secret** (`whsec_...`) and enter it in Admin Settings.

---

## For Live Keys (Production Checklist)

When moving to production:

1. Switch Stripe dashboard to **Live mode** (toggle at top)
2. Create a new restricted key with the same permissions as above
3. Name it `rentalTimeWaver-live-YYYYMMDD`
4. Enter `pk_live_...` and `rk_live_...` in Admin Settings (本番環境用 section)
5. Create a live webhook endpoint with the same events
6. Enter the live `whsec_...` in Admin Settings
7. In Admin Settings, toggle **システム稼働モード** from テスト to 本番
8. Test with a real card (¥100 charge, then refund)

---

## Security Notes

- **Never** commit API keys to git
- **Never** use standard `sk_*` keys in production — always use restricted `rk_*` keys
- Rotate keys periodically (create new key → update Secret Manager → revoke old key)
- Restricted keys cannot be viewed again after creation — store them immediately
- The publishable key (`pk_*`) is safe for frontend use — it can only be used to create tokens
