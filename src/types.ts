
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
export type ApplicationStatus = 'pending' | 'awaiting_consent_form' | 'consent_form_review' | 'consent_form_approved' | 'approved' | 'rejected' | 'canceled' | 'payment_sent' | 'completed' | 'shipped' | 'in_use' | 'expired' | 'returning' | 'inspection' | 'returned' | 'damaged' | 'closed';

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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const deviceConverter = createConverter<Device>();

// =============================================================================
// Settings
// =============================================================================
export interface GlobalSettings {
  id: string;
  // Non-sensitive fields (stored in Firestore)
  waitlistEmailInterval?: number;
  waitlistValidityHours?: number;
  applicationSessionMinutes?: number;
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
  staff?: Array<{ name: string; email: string; role: 'operations' | 'support' | 'admin' }>;
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const emailTemplateConverter = createConverter<EmailTemplate>();

export interface News {
  id: string;
  title: string;
  body: string;
  content: string;
  status: 'draft' | 'published';
  publishedAt?: Timestamp;
  isPublic: boolean;
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
