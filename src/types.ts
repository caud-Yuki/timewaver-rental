
import { FieldValue, Timestamp, DocumentData, FirestoreDataConverter, QueryDocumentSnapshot, SnapshotOptions, WithFieldValue, PartialWithFieldValue } from 'firebase/firestore';

const createConverter = <T extends { id: string }>(): FirestoreDataConverter<T> => ({
  toFirestore(data: WithFieldValue<T> | PartialWithFieldValue<T>): DocumentData {
    const { id, ...rest } = data as any; 
    return rest;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): T {
    const data = snapshot.data(options)!;
    return { id: snapshot.id, ...data } as T;
  }
});

// =============================================================================
// User & Profile
// =============================================================================
export interface UserProfile {
  id: string;
  email: string;
  role: 'user' | 'admin';
  familyName?: string;
  givenName?: string;
  familyNameKana?: string;
  givenNameKana?: string;
  tel?: string;
  zipcode?: string;
  prefectureCode?: string;
  address1?: string;
  address2?: string;
  applicantType?: ApplicantType;
  companyName?: string;
  invoiceNumber?: string;
  stripeCustomerId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const userProfileConverter = createConverter<UserProfile>();

// =============================================================================
// Application
// =============================================================================
export type ApplicationStatus = 'pending' | 'awaiting_consent_form' | 'consent_form_review' | 'consent_form_approved' | 'approved' | 'rejected' | 'canceled' | 'payment_sent' | 'awaiting_bank_transfer' | 'completed' | 'shipped' | 'in_use' | 'expired' | 'returning' | 'inspection' | 'returned' | 'damaged' | 'closed';

export type ApplicantType = 'individual' | 'corporate';

export interface CorporateInfo {
  corporateNumber?: string;       // 法人番号
  invoiceNumber?: string;         // インボイス登録番号
  companyName?: string;           // 法人名 / 会社名
  companyZipcode?: string;        // 会社郵便番号
  companyAddress?: string;        // 会社住所
  companyPhone?: string;          // 会社電話番号
  contactName?: string;           // 担当者名
  contactEmail?: string;          // 担当者メールアドレス
}

export interface Application {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  deviceType: string;
  rentalPeriod: number;
  rentalType?: 'new' | 'renew';
  payType: 'monthly' | 'full';
  payAmount?: number;
  status: ApplicationStatus;
  agreementPdfUrl?: string;
  agreementImageUrls?: string[];
  identificationImageUrl?: string;
  deviceSerialNumber?: string;
  deviceId?: string;
  paymentLinkId?: string;
  // 決済手段。未設定はカード（Stripe）として扱う。'bank_transfer' は銀行振込（一括のみ）。
  paymentMethod?: 'card' | 'bank_transfer';
  // 銀行振込の進行情報（paymentMethod === 'bank_transfer' のとき使用）
  bankTransfer?: {
    amount?: number;            // 請求金額（円）
    deadline?: string;          // 振込期限（ISO文字列）
    instructionsSentAt?: string; // 振込案内メール送信日時
    confirmedAt?: string;       // 入金確認日時
    confirmedBy?: string;       // 入金確認した管理者のUID/名前
  };
  // Applicant classification & corporate info
  applicantType?: ApplicantType;
  corporateInfo?: CorporateInfo;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const applicationConverter = createConverter<Application>();

// =============================================================================
// Device & Modules
// =============================================================================
export interface DeviceModule {
  id: string;
  name: string;
  description: string;
  price?: number;
  point: number;
  order?: number;
}
export const deviceModuleConverter = createConverter<DeviceModule>();

export interface DeviceTypeCode {
  id: string;
  type: string; 
  description: string;
  price: {
    "3m": { full: number; monthly: number };
    "6m": { full: number; monthly: number };
    "12m": { full: number; monthly: number };
  };
  fullPaymentDiscountRate: number;
  modules: DeviceModule[];
}
export const deviceTypeCodeConverter = createConverter<DeviceTypeCode>();

export type DeviceStatus = 'available' | 'in_use' | 'maintenance' | 'processing' | 'under_review' | 'terminated_early' | 'terminated' | 'active';

export interface Device {
  id: string;
  type: string; // This is the "Name" (e.g., TimeWaver Mobile)
  serialNumber: string;
  typeCode: string; // Based on your screenshot, this is a string "tw-m", not an object
  description?: string;
  price: {
    "3m": { full: number; monthly: number };
    "6m": { full: number; monthly: number };
    "12m": { full: number; monthly: number };
  };
  fullPaymentDiscountRate?: number;
  status: DeviceStatus;
  modules?: DeviceModule[];
  packageContents?: string[];
  currentUserId?: string | null;
  contractStartAt?: Timestamp | null;
  contractEndAt?: Timestamp | null;
  // Visibility on the public /devices catalog. `undefined` = visible by default
  // (legacy docs without this field keep their current behavior).
  isPublic?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const deviceConverter = createConverter<Device>();

// =============================================================================
// Notification Destinations (Google Chat)
// =============================================================================
export interface GoogleChatDestination {
  id: string;            // short unique id (e.g. Date.now().toString(36) + suffix)
  label: string;         // admin-facing display name, e.g. "TimeWaver管理者通知"
  enabled: boolean;      // master on/off for this destination
  hasUrl: boolean;       // mirror flag: true when the matching Secret Manager entry is set
}

// =============================================================================
// Landing CTA Configuration
// =============================================================================
export interface LandingCtaButton {
  label: string;
  url: string;
  enabled: boolean;
}

export interface LandingCtaConfig {
  primary: LandingCtaButton;
  secondary: LandingCtaButton;
}

export interface LandingCtas {
  preBookingOn: LandingCtaConfig;
  preBookingOff: LandingCtaConfig;
}

// =============================================================================
// Settings
// =============================================================================
export interface GlobalSettings {
  id: string;
  // Non-sensitive fields (stored in Firestore)
  waitlistEmailInterval?: number;
  waitlistValidityHours?: number;
  applicationSessionMinutes?: number;
  // キャンセル待ち案内の送信順序ルール。
  //   'corporate_first' — 法人を先着順 → そのあと個人を先着順
  //   'individual_first' — 個人を先着順 → そのあと法人を先着順
  //   'unified_fcfs' — 法人・個人を区別せず、登録された順番にそのまま案内
  waitlistPriorityMode?: 'corporate_first' | 'individual_first' | 'unified_fcfs';
  mode?: 'test' | 'production';
  managerName?: string;
  managerEmail?: string;
  companyName?: string;
  companyPhone?: string;
  companyPostalCode?: string;
  companyPrefecture?: string;
  companyCity?: string;
  companyAddress?: string;
  companyBuilding?: string;
  serviceName?: string;
  geminiModel?: string;
  aiContext?: string;
  shippingBufferDays?: number;
  moduleBasePrice?: number;
  // 銀行振込の振込先口座情報（メール差し込みに使用）
  bankTransfer?: {
    bankName?: string;      // 銀行名
    branch?: string;        // 支店名
    accountType?: string;   // 預金種別（普通/当座）
    accountNumber?: string; // 口座番号
    accountHolder?: string; // 口座名義
    note?: string;          // 補足（振込手数料の負担など）
  };
  // 振込期限（営業日数）。未設定時は 7。
  bankTransferDeadlineDays?: number;
  staff?: Array<{ name: string; email: string; role: 'operations' | 'support' | 'admin' }>;
  // Pre-booking mode — when true, /devices disables apply buttons and /about-twrental final CTA routes to the pre-booking form.
  preBookingMode?: boolean;
  // External booking URL (e.g. Google Calendar / TimeRex) used for the "無料相談予約" CTA.
  // Deprecated: superseded by landingCtas. Retained for /devices ComingSoon fallback compatibility.
  consultationBookingUrl?: string;
  // Configurable CTA buttons rendered in the /about-twrental hero and final CTA sections.
  // Two slots per mode (primary + secondary), each independently toggleable.
  landingCtas?: LandingCtas;
  // Google Chat notification destinations (multi-destination support).
  // Webhook URLs live in Secret Manager as GOOGLE_CHAT_WEBHOOK_<id>; this list
  // holds only the admin-visible metadata.
  googleChatDestinations?: GoogleChatDestination[];
  // /about-twrental section visibility toggles (undefined = visible by default).
  showDeviceDigest?: boolean;
  emailDesign?: {
    primaryColor?: string;
    buttonColor?: string;
    buttonRadius?: string;
    fontFamily?: string;
    footerText?: string;
  };
  updatedAt?: Timestamp;
  // Sensitive fields (Stripe, Gemini, Chatwork, Google Chat) are stored in Google Cloud Secret Manager.
  // See src/lib/secret-actions.ts for read/write operations.
}
export const globalSettingsConverter = createConverter<GlobalSettings>();

// =============================================================================
// Waitlist
// =============================================================================
export type WaitlistStatus = 'waiting' | 'notified' | 'scheduled' | 'expired' | 'converted' | 'processing';

export interface Waitlist {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  deviceType: string;
  deviceId?: string;
  status: WaitlistStatus;
  // Applicant classification snapshotted at the time of waitlist signup.
  // Used for prioritized offer dispatch (see GlobalSettings.waitlistPriorityMode).
  applicantType?: ApplicantType;
  companyName?: string;
  corporateNumber?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  scheduledNotifyAt?: Timestamp;
}
export const waitlistConverter = createConverter<Waitlist>();

// =============================================================================
// Coupon
// =============================================================================
export interface Coupon {
  id: string;
  name: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  status: 'active' | 'inactive';
  expiresAt?: Timestamp;
  maxTotalUsers?: number;
  currentUsageCount?: number;
  newCustomerOnly?: boolean;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const couponConverter = createConverter<Coupon>();

// =============================================================================
// Email & News
// =============================================================================
export interface EmailTemplate {
  id: string;
  type: string;
  name: string;
  subject: string;
  body: string;
  isAdmin?: boolean;
  // Optional chat-specific overrides used when this template is dispatched to
  // Google Chat. When empty, the email body is auto-stripped of HTML and used.
  chatBody?: string;
  chatSubject?: string;
  // 'text' (default) sends a plain markdown message; 'card' renders a
  // Google Chat Cards V2 payload with header / body / buttons.
  chatFormat?: 'text' | 'card';
  // Buttons rendered at the bottom of the card. Label and URL both support
  // {{placeholder}} substitution. Only used when chatFormat === 'card'.
  chatCardButtons?: Array<{ label: string; url: string }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const emailTemplateConverter = createConverter<EmailTemplate>();

// Mail Accounts (Phase 26 multi-account sender architecture)
export type MailAccountProvider = 'gmail_oauth' | 'smtp';
export type MailAccountStatus = 'active' | 'pending_oauth' | 'unauthorized' | 'revoked';

export interface MailAccount {
  id: string;
  displayName: string;
  email: string;
  provider: MailAccountProvider;
  status: MailAccountStatus;
  isDefault: boolean;
  fromName?: string;
  consecutiveFailures?: number;
  lastError?: string | null;
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
export const mailAccountConverter = createConverter<MailAccount>();

export interface News {
  id: string;
  title: string;
  body: string;
  content: string;
  status: 'draft' | 'published';
  publishedAt?: Timestamp;
  isPublic: boolean;
  // Optional outbound link — when set, /news shows a button jumping to this URL.
  linkUrl?: string;
  linkLabel?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const newsConverter = createConverter<News>();

// =============================================================================
// Payment & Subscription
// =============================================================================
export interface Subscription {
  id: string;
  userId: string;
  deviceId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePaymentIntentId?: string;
  stripeStatus?: {
    status?: string;
    currentPeriodEnd?: string;
    cancelAt?: string;
    lastSyncedAt?: string;
  };
  payAmount?: number;
  payType?: 'monthly' | 'full';
  status: 'active' | 'completed' | 'canceled' | 'expired';
  startAt: Timestamp;
  endAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const subscriptionConverter = createConverter<Subscription>();

export interface PaymentLink {
  id: string;
  applicationId: string;
  url: string;
  expiresAt: Timestamp;
  isPaid: boolean;
  status?: 'open' | 'paid' | 'expired';
  payType?: 'monthly' | 'full';
  payAmount?: number;
  deviceName?: string;
  deviceId?: string;
  rentalType?: 'new' | 'renew';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const paymentLinkConverter = createConverter<PaymentLink>();

// =============================================================================
// Consent Form
// =============================================================================
export type ConsentSectionType = 'paragraph' | 'terms_list' | 'consent_items' | 'signature';

export interface ConsentFormSection {
  id: string;
  order: number;
  title: string;
  type: ConsentSectionType;
  content?: string;   // paragraph type
  items?: string[];   // terms_list / consent_items
}

export interface ConsentFormDoc {
  id: string;
  sections: ConsentFormSection[];
  updatedAt?: Timestamp;
}
export const consentFormConverter = createConverter<ConsentFormDoc>();

// =============================================================================
// About TWRental — Testimonials, FAQ, Case Studies, Early Booking
// =============================================================================
export interface Testimonial {
  id: string;
  name: string;
  title?: string;        // 肩書き (セラピスト等)
  industry?: string;     // 業種 (medical / therapist / healer / corporate / other)
  comment: string;
  imageUrl?: string;
  rating?: number;       // 1-5
  videoUrl?: string;     // YouTube embed URL
  order?: number;
  isPublic: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const testimonialConverter = createConverter<Testimonial>();

export interface Faq {
  id: string;
  question: string;
  answer: string;
  order?: number;
  isPublic: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const faqConverter = createConverter<Faq>();

export interface CaseStudy {
  id: string;
  title: string;
  industry?: string;
  client?: string;
  summary: string;
  body?: string;
  imageUrl?: string;
  order?: number;
  isPublic: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const caseStudyConverter = createConverter<CaseStudy>();

// =============================================================================
// AI Knowledge Base (QA list referenced by the support chatbot)
// =============================================================================
export interface QaCategory {
  id: string;
  name: string;
  // Short hint that helps the AI decide whether a question belongs here.
  description?: string;
  order?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const qaCategoryConverter = createConverter<QaCategory>();

export interface QaItem {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
  order?: number;
  // When false, the AI ignores this entry. Defaults to true.
  isPublic?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const qaItemConverter = createConverter<QaItem>();

export type EarlyBookingStatus = 'new' | 'contacted' | 'converted' | 'closed';

export interface EarlyBooking {
  id: string;
  name: string;
  email: string;
  phone?: string;
  companyName?: string;
  desiredDevice?: string;
  message?: string;
  status: EarlyBookingStatus;
  followUpSentAt?: Timestamp;
  adminNotifiedAt?: Timestamp;
  launchNoticeSentAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const earlyBookingConverter = createConverter<EarlyBooking>();
