
import { Timestamp, DocumentData, FirestoreDataConverter, QueryDocumentSnapshot, SnapshotOptions } from 'firebase/firestore';

const createConverter = <T extends { id: string }>() => ({
  toFirestore(data: Partial<T>): DocumentData {
    const { id, ...rest } = data;
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
  customerId?: string; 
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const userProfileConverter = createConverter<UserProfile>();

// =============================================================================
// Application
// =============================================================================
export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'canceled' | 'payment_sent' | 'completed';

export interface Application {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  deviceType: string;
  rentalPeriod: number;
  rentalType?: 'new' | 'renew';
  payType: 'monthly' | 'one-time';
  payAmount?: number;
  status: ApplicationStatus;
  agreementPdfUrl?: string;
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
  point: string;
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

export type DeviceStatus = 'available' | 'in_use' | 'maintenance' | 'processing' | 'terminated_early' | 'terminated' | 'active';

export interface Device {
  id: string;
  name: string;
  description?: string;
  serialNumber: string;
  type: string; 
  typeCode: string; 
  price: {
    "3m": { full: number; monthly: number };
    "6m": { full: number; monthly: number };
    "12m": { full: number; monthly: number };
  };
  fullPaymentDiscountRate?: number;
  status: DeviceStatus;
  modules?: DeviceModule[];
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
  firstpayTest?: { apiKey: string; apiSecret: string; };
  firstpayProd?: { apiKey: string; apiSecret: string; };
  waitlistEmailInterval?: number;
  waitlistValidityHours?: number;
  applicationSessionMinutes?: number;
  mode?: 'test' | 'production';
  managerName?: string;
  managerEmail?: string;
  companyName?: string;
  updatedAt?: Timestamp;
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
  customerId?: string;
  payAmount?: number;
  payType?: 'monthly' | 'one-time';
  status: 'active' | 'completed' | 'canceled';
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
  payType?: 'monthly' | 'one-time';
  payAmount?: number;
  deviceName?: string;
  deviceId?: string;
  rentalType?: 'new' | 'renew';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export const paymentLinkConverter = createConverter<PaymentLink>();
