# Firestore Collections Reference

## Core Collections

### `users`
User profiles (created on registration)
| Field | Type | Description |
|---|---|---|
| `email` | string | Email address |
| `role` | 'user' \| 'admin' | User role |
| `familyName` | string? | Last name |
| `givenName` | string? | First name |
| `familyNameKana` | string? | Last name (furigana) |
| `givenNameKana` | string? | First name (furigana) |
| `tel` | string? | Phone number |
| `zipcode` | string? | Postal code |
| `prefectureCode` | string? | Prefecture code (01-48) |
| `address1` | string? | City/town/block/lot |
| `address2` | string? | Building/room |
| `companyName` | string? | Company name |
| `invoiceNumber` | string? | Invoice registration number |
| `customerId` | string? | Stripe customer ID |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

### `devices`
Rental devices
| Field | Type | Description |
|---|---|---|
| `type` | string | Display name (e.g. "TimeWaver Mobile") |
| `serialNumber` | string | Serial number |
| `typeCode` | string | Type code ID (references `deviceTypeCodes`) |
| `description` | string? | Device description |
| `price` | object | `{ "3m": { full, monthly }, "6m": { full, monthly }, "12m": { full, monthly } }` |
| `fullPaymentDiscountRate` | number? | Discount rate (%) for full payment |
| `status` | string | 'available' \| 'active' \| 'maintenance' \| 'processing' |
| `modules` | DeviceModule[]? | Array of module objects installed on this device |
| `packageContents` | string[]? | Package contents list |
| `currentUserId` | string? | Current renting user ID |
| `contractStartAt` | Timestamp? | Contract start date |
| `contractEndAt` | Timestamp? | Contract end date |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

### `deviceTypeCodes`
Device type code definitions
| Field | Type | Description |
|---|---|---|
| `id` | string | Type code (e.g. "tw-m") |
| `type` | string | Type name (e.g. "TimeWaver Mobile") |

### `modules`
**Collection name: `modules`** (NOT `deviceModules`)
Available device modules
| Field | Type | Description |
|---|---|---|
| `name` | string | Module name |
| `description` | string? | Module description |
| `point` | number | Point multiplier for pricing |
| `order` | number? | Display order |

### `applications`
Rental applications
| Field | Type | Description |
|---|---|---|
| `userId` | string | Applicant user ID |
| `userName` | string | Applicant name |
| `userEmail` | string | Applicant email |
| `deviceId` | string | Target device ID |
| `deviceSerialNumber` | string | Device serial number |
| `deviceType` | string | Device type name |
| `rentalType` | number | 3, 6, or 12 (months) |
| `payType` | string | 'monthly' \| 'full' |
| `payAmount` | number | Payment amount |
| `status` | ApplicationStatus | Current status |
| `shippingTel` | string? | Shipping phone |
| `shippingZipcode` | string? | Shipping postal code |
| `shippingPrefecture` | string? | Shipping prefecture |
| `shippingAddress1` | string? | Shipping address |
| `shippingAddress2` | string? | Shipping building |
| `shippingCompanyName` | string? | Shipping company |
| `identificationImageUrl` | string | ID document URL |
| `isRenewal` | boolean? | true if contract renewal |
| `previousSubscriptionId` | string? | Previous subscription ID (renewals) |
| `previousEndAt` | string? | Previous subscription end date (renewals) |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

### `subscriptions`
Active/past subscriptions
| Field | Type | Description |
|---|---|---|
| `userId` | string | User ID |
| `deviceId` | string | Device ID |
| `deviceType` | string? | Device type name |
| `customerId` | string | Stripe customer ID |
| `payType` | string | 'monthly' \| 'full' |
| `rentalMonths` | number | 3, 6, or 12 |
| `payAmount` | number | Payment amount |
| `stripeSubscriptionId` | string? | Stripe subscription ID |
| `stripePaymentIntentId` | string? | Stripe PaymentIntent ID |
| `status` | string | 'active' \| 'expired' \| 'canceled' |
| `startAt` | Timestamp | Subscription start |
| `endAt` | Timestamp | Subscription end |
| `applicationId` | string | Linked application ID |
| `previousSubscriptionId` | string? | For renewals |
| `isRenewal` | boolean? | |
| `renewalReminderSent` | boolean? | |
| `stripeStatus` | object? | Synced from Stripe API |
| `refundHistory` | array? | Refund records |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

### `paymentLinks`
Payment URLs sent to users
| Field | Type | Description |
|---|---|---|
| `applicationId` | string | Linked application |
| `deviceId` | string | Device ID |
| `deviceName` | string | Device name |
| `payType` | string | 'monthly' \| 'full' |
| `payAmount` | number | Amount |
| `status` | string | 'active' \| 'used' |
| `createdAt` | Timestamp | |

### `waitlist`
Waitlist entries
| Field | Type | Description |
|---|---|---|
| `userId` | string | User ID |
| `userName` | string? | User name |
| `userEmail` | string? | User email |
| `deviceType` | string | Device type name |
| `deviceId` | string? | Device ID |
| `status` | WaitlistStatus | 'waiting' \| 'notified' \| 'scheduled' \| 'expired' \| 'converted' \| 'processing' |
| `scheduledNotifyAt` | Timestamp? | Scheduled notification time |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

### `emailTriggers`
Email/chat trigger configuration
| Field | Type | Description |
|---|---|---|
| `triggerPoint` | string | Trigger ID |
| `templateId` | string | Email template ID |
| `enabled` | boolean | Whether trigger is active |
| `channels` | object? | `{ email: bool, chatwork: bool, googleChat: bool }` |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

### `emailTemplates`
Email/chat message templates
| Field | Type | Description |
|---|---|---|
| `type` | string | Category |
| `name` | string | Display name |
| `subject` | string | Email subject (with {{placeholders}}) |
| `body` | string | Email body (with {{placeholders}}) |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

### `settings` (single doc: `global`)
Global system settings
| Field | Type | Description |
|---|---|---|
| `mode` | string | 'test' \| 'production' |
| `waitlistEmailInterval` | number? | Hours between waitlist notifications |
| `waitlistValidityHours` | number? | Validity period for waitlist offers |
| `applicationSessionMinutes` | number? | Session timeout for apply form |
| `shippingBufferDays` | number? | Business days buffer before first payment |
| `geminiModel` | string? | AI model selection |
| `moduleBasePrice` | number? | Base add-up price per module point |
| `managerName` | string? | Manager name |
| `managerEmail` | string? | Manager email |
| `companyName` | string? | Company name |
| `companyPhone` | string? | Company phone |
| `companyPostalCode` | string? | Postal code |
| `companyPrefecture` | string? | Prefecture |
| `companyCity` | string? | City |
| `companyAddress` | string? | Address |
| `companyBuilding` | string? | Building |
| `staff` | array? | `[{ name, email, role }]` |
| `updatedAt` | Timestamp | |

### `news`
News articles
| Field | Type | Description |
|---|---|---|
| `title` | string | Article title |
| `content` | string | Article content |
| `body` | string | Body text |
| `status` | string | 'draft' \| 'published' |
| `isPublic` | boolean | Visibility |
| `publishedAt` | Timestamp? | Publish date |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

### `coupons`
Discount codes
| Field | Type | Description |
|---|---|---|
| `code` | string | Coupon code |
| `discount` | number | Discount amount or percentage |
| `validUntil` | Timestamp | Expiry date |

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
| `GOOGLE_CHAT_WEBHOOK_URL` | Google Chat webhook URL |
