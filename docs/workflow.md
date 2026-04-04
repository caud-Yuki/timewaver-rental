# ChronoRent — Complete Workflow Documentation

## System Overview
ChronoRent is a TimeWaver device rental platform built with Next.js 14, Firebase, and Stripe payment gateway.

---

## Status Flow Diagram

```
[User Registration] → pending → awaiting_consent_form → consent_form_review → consent_form_approved
→ payment_sent → completed → shipped → in_use → expired → returning → inspection → returned → closed
                                                                                   → damaged → closed
                                     ↘ canceled → returning → inspection → returned/damaged → closed
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
- **Email**: `application_submitted` → user

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
- User completes payment at `/payment/{paymentLinkId}`
- Stripe API called (charge or recurring)
- For new subscriptions: `startAt = today + N business days` (buffer for shipping)
- For renewals: `startAt = previous endAt`
- Subscription created in `subscriptions` collection
- Application → `status: completed`
- **Email**: `payment_completed` → user
- **Email**: `device_prep_required` → operations staff (with shipping address + deadline)

### 6. 発送 (Shipping)
- Admin changes status to `shipped` in 申請管理
- Auto-transitions to `in_use`
- **Email**: `device_shipped` → user

### 7. 利用中 (In Use)
- User can see device in `/mypage/devices`
- Monthly payments auto-processed by Stripe
- **Email**: `payment_failed` → user (if monthly payment fails)

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
| Mark as shipped | `/admin/applications` → status dropdown | shipped email + auto→in_use |
| Sync with Stripe | `/admin/payments` → Stripe同期 | renewal reminders, auto-expiry |
| Stop subscription | `/admin/payments` → ⏹ button | cancel email, return guide |
| Refund payment | `/admin/payments/{id}/history` → 返金 | refund record in Firestore |
| Inspect returned device | `/admin/applications` → status dropdown | inspection email to staff |
| Confirm return / damage | `/admin/applications` → status dropdown | return/damage email to user |

---

## Email/Chat Trigger Points

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
| `paymentLinks` | Payment URLs | applicationId, deviceId, payAmount, status |
| `waitlist` | Waitlist entries | userId, deviceId, status |
| `emailTriggers` | Trigger → template mapping | triggerPoint, templateId, enabled, channels |
| `emailTemplates` | Email/chat templates | name, subject, body, type |
| `settings` | Global settings | mode, staff, shippingBufferDays, company info |
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

## Cloud Functions (7 total)

| Function | Type | Purpose |
|---|---|---|
| `getPaymentData` | onCall | Fetch payment data from Stripe API |
| `getSubscriptionsList` | onCall | List subscriptions with enriched user data |
| `syncPaymentData` | onCall | Sync with Stripe, auto-expire, send renewal reminders |
| `stopRecurringPayment` | onCall | Stop recurring subscription via Stripe API |
| `refundPayment` | onCall | Refund a payment via Stripe API |
| `getPaymentHistory` | onCall | Fetch payment execution history from Stripe |
| `onApplicationUpdate` | onDocumentUpdated | Trigger emails/chat on application status changes |
