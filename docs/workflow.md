# TimeWaverHub — Complete Workflow Documentation

## System Overview
TimeWaverHub is a TimeWaver device rental platform built with Next.js 14, Firebase, and Stripe payment gateway.

---

## Status Flow Diagram

```
[User Registration] → pending → awaiting_consent_form → consent_form_review → consent_form_approved
→ payment_sent → completed → shipped → in_use → expired → returning → inspection → returned → closed
   ↘ awaiting_bank_transfer ↗                                                      → damaged → closed
                                     ↘ canceled → returning → inspection → returned/damaged → closed

(consent_form_approved からの分岐: カード決済 = payment_sent / 銀行振込 = awaiting_bank_transfer。
 どちらも入金が確定した時点で completed に合流する)
```

---

## User Journey

### 1. 会員登録 (Registration)
- User creates account via Firebase Auth
- Profile created in `users` collection
- **Email**: `welcome_registration` → user

### 2. 機器選択・申込 (Device Selection & Application)
- User browses `/devices` → selects device
- Device locked (`status: processing`)
- User fills: rental plan (3/6/12m), payment type (monthly/full), ID upload, shipping address
- Shipping address pre-populated from profile if available
- Application created in `applications` collection with `status: pending`
- Device moves `processing` → `under_review` (審査中) — the lock holder does this from the client,
  so `firestore.rules` must keep allowing that one transition (case 4 under `match /devices`).
  `under_review` → anything is admin-only, so a user cannot pull a device back out of review.
- **The waitlist is NOT cleared here.** The application can still be rejected, in which case the
  device returns to `available` and the waiting users must be notified in order. That ordering is
  driven by the admin screens (`/admin`, `/admin/waitlist`), which move entries to
  `notified` / `scheduled`. An earlier implementation batch-deleted the device's waitlist entries
  at this point; `waitlist` delete is admin-only, so every general user hit `permission-denied`
  and never reached the completion toast.
- Everything after the `applications` create is best-effort: it is wrapped in its own `try`/`catch`
  and only logged, because the application document already exists and admins can correct the rest.
- The session lock is released by `releaseDeviceLock()` on timeout / unmount / `beforeunload`,
  guarded by `isSubmittedRef`. Set that flag **only once submission is actually under way** — if an
  early `return` leaves it `true`, the release becomes a permanent no-op and the device stays
  `processing` forever, blocking every other user.
- **Email**: `application_submitted` → user
- **Email**: `application_submitted_admin` → admin, plus a Google Chat webhook post

> **Deleting an application is customer-facing.** `onApplicationDeleted` releases the linked device
> and then calls `onDeviceReleased()`, which **publishes a public 「【空き速報】」 news article and
> emails every `status: 'waiting'` user on that device's waitlist**. The release only happens when
> the device is not already `available`, so when you delete an application by hand (cleaning up a
> test, removing a mistake), **set the device back to `available` first** — then the delete is
> quiet. Deleting first and fixing the device afterwards has already sent the notifications.

### 3. 審査 (Admin Review)
- Admin reviews in `/admin/applications`
- **Approve** → `status: awaiting_consent_form`
  - **Email**: `application_approved` → user (asks for consent form)
- **Reject** → `status: rejected`
  - **Email**: `application_rejected` → user

### 4. 同意書 (Consent Form)
- User uploads consent form → `status: consent_form_review`
  - **Email**: `consent_form_submitted` → admin
- Admin approves consent → `status: consent_form_approved`
  - **Email**: `consent_form_approved` → user (with payment link)

### 5. 決済 (Payment)
- 決済リンクは `status: 'pending'` + `expiresAt`（既定7日／`settings/global.paymentLinkValidityDays`）で発行される
- リンクは本人と管理者しか読めない。未ログインなら `/auth/login?redirect=...` へ誘導
- User completes payment at `/payment/{paymentLinkId}`
- Stripe API called (charge or recurring)
- For new subscriptions: `startAt = today + N business days` (buffer for shipping)
- For renewals: `startAt = previous endAt`
- Subscription created in `subscriptions` collection
- Application → `status: completed`
- 決済リンク → `status: 'paid'` + `paidAt`（Webhook `payment_intent.succeeded` でも確定させる）
- **Email**: `payment_completed` → user
- **Email**: `device_prep_required` → operations staff (with shipping address + deadline)

### 5b. 銀行振込 (Bank Transfer — 一括払いのみ)
カードを使わない支払い経路。決済ページ (`/payment/{id}`) を通らないぶん、契約レコードの作成を
サーバー (`onApplicationUpdate`) が肩代わりする。

- 前提: `/admin/settings` の「銀行振込 設定」に振込先口座と振込期限（営業日）が登録されていること。
  未登録だと案内メールの口座欄が空で届く。
- Admin が `consent_form_approved` の申請で 銀行振込案内 を押す → `status: awaiting_bank_transfer`,
  `paymentMethod: 'bank_transfer'`（月々払いの申請にはボタンを出さない）
- `onApplicationUpdate` が請求額（**サーバー再計算値**）・振込期限・案内送付日時を
  `application.bankTransfer` に刻む
- **Email**: `bank_transfer_instructions` → user（振込先・金額・期限・申請番号）
- **Email**: `bank_transfer_pending_admin` → admin（入金確認待ちの通知）
- User は マイページ → 申請履歴 の 振込先を表示 でも同じ内容を確認できる
- 入金を確認した Admin が 入金確認 を押す → `status: completed`
  （申請一覧に請求額と期限、期限超過の目印が出る。誤操作防止に確認ダイアログを挟む）
- `onApplicationUpdate` が Stripe を経由しない契約レコードを作成し、
  デバイスを `active` + 契約開始日を刻む → 以降はカード決済と同じ導線
- マイページの決済履歴には Stripe の明細が無いので、契約レコードから「一括 / 決済完了」の
  1 行を組み立てて表示する（`getPaymentHistory`）
- 回帰テスト: `npm run test:bank-transfer`（詳細は [FLOW-bank-transfer.md](./FLOW-bank-transfer.md)）

### 6. 発送 (Shipping)
- Admin changes status to `shipped` in 申請管理
- Auto-transitions to `in_use`
- **Email**: `device_shipped` → user

### 7. 利用中 (In Use)
- User can see device in `/mypage/devices`
- Monthly payments auto-processed by Stripe
- **Email**: `payment_failed` → user (if monthly payment fails)
- User can file a repair / support request from `/mypage/support/repair`
  (writes `supportRequests`; staff triage it at `/admin/support-requests`)
- **Email**: `support_request` → user (受付確認) + ops staff (対応依頼)
- **Email**: `support_request_resolved` → user, when staff mark it 対応完了
  (off by default — bind a template in `/admin/email-triggers` to enable)

### 8. 契約更新 (Renewal)
- 30 days before expiry: `syncPaymentData` sends renewal reminder
- **Email**: `contract_renewal_reminder` → user
- User can click 契約更新 in マイデバイス (only within 1 month of expiry or test mode)
- Creates new application with `isRenewal: true`, `previousSubscriptionId`
- New subscription `startAt` = old `endAt` (seamless continuation)
- Old subscription → `expired` (but device NOT released since renewal exists)

### 9. 契約満了 / 解約 (Expiry / Cancellation)
- **Auto-expiry**: `syncPaymentData` detects `endAt < now`
- **Manual cancel**: Admin stops recurring via 支払管理
- Both → `status: expired/canceled`
- Check for renewal subscription → if none:
  - Device released (`status: available`)
  - News auto-published
  - Waitlist users notified
- **Email**: `contract_expired` / `subscription_canceled` → user
- **Email**: `device_return_guide` → user
- Auto-transition to `returning`

### 10. 返却 (Return)
- Admin receives device → changes to `inspection`
- **Email**: `device_inspection` → operations staff
- No issues → `returned` → auto → `closed`
  - **Email**: `device_returned` → user
- Issues found → `damaged`
  - **Email**: `device_damaged` → user (deposit deducted)
  - Admin resolves → `closed`

---

## Admin Journey Summary

| Admin Action | Location | Triggers |
|---|---|---|
| Review application | `/admin/applications` | approve/reject emails |
| Review consent form | `/admin/applications` | consent email to user |
| Create payment link | `/admin/applications` | payment link email |
| Send bank transfer info | `/admin/applications` → 銀行振込案内 | 振込案内メール（user）+ 入金確認待ち通知（admin） |
| Confirm bank transfer | `/admin/applications` → 入金確認 | 契約作成 + 決済完了メール + 発送準備依頼 |
| Mark as shipped | `/admin/applications` → status dropdown | shipped email + auto→in_use |
| Sync with Stripe | `/admin/payments` → Stripe同期 | renewal reminders, auto-expiry |
| Stop subscription | `/admin/payments` → ⏹ button | cancel email, return guide |
| Refund payment | `/admin/payments/{id}/history` → 返金 | refund record in Firestore |
| Inspect returned device | `/admin/applications` → status dropdown | inspection email to staff |
| Confirm return / damage | `/admin/applications` → status dropdown | return/damage email to user |
| Triage repair / support request | `/admin/support-requests` → status dropdown | resolution email to user (if enabled) |
| Re-send intake notification | `/admin/support-requests` → ✉ button | `resendSupportRequestNotification` → ops staff |

---

## Email/Chat Trigger Points

> **Placeholder contract.** `/admin/email-templates` shows a 「代入キー一覧」 sidebar and admins insert
> those `{{keys}}` by clicking them. The substitution loop in `functions/src/triggers.ts` only replaces
> keys present in the table `buildTemplateData()` returns and **passes unknown ones through verbatim**,
> so a key the UI advertises but the trigger never supplies is delivered to the customer as the literal
> text `{{payAmount}}`. That happened in production until 2026-08-22: `onApplicationCreate` hand-picked
> six fields, so every applicant's receipt email showed `{{rentalType}}ヶ月プラン / ¥{{payAmount}}/
> {{payType}}`. Application-driven triggers must pass the whole application document (the way
> `onApplicationUpdate`'s `applicationData` does) rather than a curated subset.
>
> Guard: `npm run test:email-placeholders` cross-checks the UI's advertised keys against what the
> submission trigger supplies, and asserts the rendered body has no `{{...}}` left. Note the built-in
> `SYSTEM_TEMPLATES` are deliberately minimal — the templates that actually ship are the admin-edited
> ones in Firestore, which use far more placeholders, so testing only against the built-ins is not
> enough to catch this.
>
> `payAmount` and `payType` are normalised for display inside `buildTemplateData()` (thousands
> separator, 月々払い / 一括払い) so every template renders them the same way. Callers that pass an
> already-formatted string (e.g. the bank transfer `transferAmount`) are left untouched.


| # | Trigger ID | Event | Recipient | Channels |
|---|---|---|---|---|
| 1 | `welcome_registration` | User registers | User | Email |
| 2 | `application_submitted` | Application submitted | User | Email |
| 3 | `application_approved` | Admin approves | User | Email |
| 4 | `application_rejected` | Admin rejects | User | Email |
| 5 | `consent_form_submitted` | User submits consent | Admin | Email, CW, GC |
| 6 | `consent_form_approved` | Admin approves consent | User | Email |
| 7 | `payment_completed` | Payment successful | User | Email |
| 8 | `payment_failed` | Payment failed | User | Email |
| 9 | `device_prep_required` | Payment done, prep needed | Ops Staff | Email, CW, GC |
| 10 | `device_shipped` | Admin ships device | User | Email |
| 11 | `contract_renewal_reminder` | 30 days before expiry | User | Email |
| 12 | `subscription_canceled` | Admin cancels subscription | User | Email |
| 13 | `contract_expired` | Contract period ended | User | Email |
| 14 | `device_return_guide` | Expired/canceled | User | Email |
| 15 | `device_inspection` | Device arrived for inspection | Ops Staff | Email, CW, GC |
| 16 | `device_returned` | Inspection OK | User | Email |
| 17 | `device_damaged` | Damage found | User | Email |
| 18 | `waitlist_device_available` | Device becomes available | Waitlist Users | Email |
| 19 | `news_published` | News published | Users | Email |
| 20 | `support_request` | Repair / support request filed | User + Ops Staff | Email, CW, GC |
| 21 | `support_request_resolved` | Request marked 対応完了 | User | Email |

CW = Chatwork, GC = Google Chat (configurable per trigger in admin UI)

---

## Firestore Collections

| Collection | Purpose | Key Fields |
|---|---|---|
| `users` | User profiles | familyName, givenName, email, role, address, tel |
| `devices` | Rental devices | type, serialNumber, typeCode, price, status, modules |
| `deviceTypeCodes` | Device type codes | id, type |
| `deviceModules` | Available modules | name, description |
| `applications` | Rental applications | userId, deviceId, status, payType, rentalType, shipping |
| `subscriptions` | Active subscriptions | userId, deviceId, payType, startAt, endAt, recurringId |
| `paymentLinks` | Payment URLs | applicationId, userId, deviceId, payAmount, status, expiresAt |
| `waitlist` | Waitlist entries | userId, deviceId, status |
| `emailTriggers` | Trigger → template mapping | triggerPoint, templateId, enabled, channels |
| `emailTemplates` | Email/chat templates | name, subject, body, type |
| `settings` | Global settings | mode, staff, shippingBufferDays, company info |
| `supportRequests` | 修理・サポート依頼 | userId, deviceId, type, description, status, adminNote |
| `news` | News articles | title, content, status, publishedAt |
| `coupons` | Discount codes | code, discount, validUntil |

---

## Secret Manager Keys

| Key | Purpose |
|---|---|
| `STRIPE_TEST_SECRET_KEY` | Stripe test secret key |
| `STRIPE_TEST_WEBHOOK_SECRET` | Stripe test webhook secret |
| `STRIPE_LIVE_SECRET_KEY` | Stripe live secret key |
| `STRIPE_LIVE_WEBHOOK_SECRET` | Stripe live webhook secret |
| `GEMINI_API_KEY` | Google Gemini AI API key |
| `CHATWORK_API_TOKEN` | Chatwork API token |
| `CHATWORK_ROOM_ID` | Chatwork room ID |
| `GOOGLE_CHAT_WEBHOOK_URL` | Google Chat incoming webhook URL |

---

## Cloud Functions (excerpt — see `functions/src/index.ts` for the full list)

| Function | Type | Purpose |
|---|---|---|
| `getPaymentData` | onCall | Fetch payment data from Stripe API |
| `getSubscriptionsList` | onCall | List subscriptions with enriched user data |
| `syncPaymentData` | onCall | Sync with Stripe, auto-expire, send renewal reminders |
| `stopRecurringPayment` | onCall | Stop recurring subscription via Stripe API |
| `refundPayment` | onCall | Refund a payment via Stripe API |
| `getPaymentHistory` | onCall | Fetch payment execution history from Stripe |
| `onApplicationUpdate` | onDocumentUpdated | Trigger emails/chat on application status changes |
| `onSupportRequestCreated` | onDocumentCreated | Notify ops staff + acknowledge the user on a new 修理・サポート依頼 |
| `onSupportRequestUpdated` | onDocumentUpdated | Notify the user when a request is marked 対応完了 |
| `resendSupportRequestNotification` | onCall | Admin retry of the staff intake notification |
