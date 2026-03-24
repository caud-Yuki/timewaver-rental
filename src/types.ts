
import { Timestamp } from 'firebase/firestore';

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

// =============================================================================
// Device & Modules
// =============================================================================
export interface DeviceModule {
  id: string;
  name: string;
  description: string;
  price: number;
}

export interface DeviceTypeCode {
  id: string;
  type: string; // e.g., 'Standard', 'Pro'
  description: string;
  price: {
    monthly: number;
    'one-time': number;
  };
  fullPaymentDiscountRate: number;
  modules: DeviceModule[];
}

export type DeviceStatus = 'available' | 'in_use' | 'maintenance' | 'processing' | 'terminated_early' | 'terminated';

export interface Device {
  id: string;
  name: string;
  description?: string;
  serialNumber: string;
  type: string; // Corresponds to DeviceTypeCode['type']
  typeCode: string; // Corresponds to DeviceTypeCode['id']
  price: {
    monthly: number;
    'one-time': number;
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

// =============================================================================
// Settings
// =============================================================================
export interface GlobalSettings {
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

// =============================================================================
// Waitlist
// =============================================================================
export type WaitlistStatus = 'waiting' | 'notified' | 'scheduled' | 'expired';

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
  expiresAt: Timestamp;
  maxTotalUsers?: number;
  currentUsageCount?: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

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

export interface News {
  id: string;
  title: string;
  body: string;
  content: string;
  status: 'draft' | 'published';
  publishedAt: Timestamp;
  isPublic: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

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

