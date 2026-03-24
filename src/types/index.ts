import { Timestamp } from 'firebase/firestore';

export type DeviceType = "TimeWaver Mobile" | "TimeWaver Mobile Quantum" | "TimeWaver Tabletop" | "TimeWaver Frequency";
export type DeviceTypeCode = "tw-m" | "tw-mq" | "tw-tt" | "tw-frq";
export type DeviceStatus = "available" | "active" | "processing" | "terminated_early" | "terminated";

export interface DeviceModule {
  id: string;
  name: string;
  point: number;
  order: number;
  description?: string;
}

export interface Device {
  id: string;
  serialNumber: string;
  type: DeviceType;
  typeCode: DeviceTypeCode;
  modules: string[];
  description: string;
  fullPaymentDiscountRate?: number;
  price: {
    "3m": { full: number; monthly: number };
    "6m": { full: number; monthly: number };
    "12m": { full: number; monthly: number };
  };
  status: DeviceStatus;
  currentUserId?: string;
  contractStartAt?: Timestamp;
  contractEndAt?: Timestamp;
  imageUrl?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'canceled';
export type RentalType = '3m' | '6m' | '12m';
export type PayType = 'monthly' | 'full';

export interface Application {
  id: string;
  userId: string;
  userName?: string; // Added
  userEmail?: string; // Added
  deviceType: DeviceType;
  rentalPeriod: RentalType; // Updated
  payType: PayType; // Added
  status: ApplicationStatus; // Updated
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GlobalSettings {
  firstpayTest: { apiKey: string; bearerToken: string };
  firstpayProd: { apiKey: string; bearerToken: string };
  waitlistEmailInterval: number;
  waitlistValidityHours: number;
  applicationSessionMinutes: number;
  updatedAt: Timestamp;
}

export type WaitlistStatus = 'waiting' | 'notified' | 'scheduled' | 'expired';

export interface Waitlist {
  id: string;
  userId: string;
  deviceType: DeviceType;
  deviceId?: string;
  status: WaitlistStatus; // Added
  createdAt: Timestamp;
  updatedAt?: Timestamp; // Added
  scheduledNotifyAt?: Timestamp; // Added
}
