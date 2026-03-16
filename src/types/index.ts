
import { Timestamp } from 'firebase/firestore';

export type DeviceType = "TimeWaver Mobile" | "TimeWaver Mobile Quantum" | "TimeWaver Tabletop" | "TimeWaver Frequency";
export type DeviceTypeCode = "tw-m" | "tw-mq" | "tw-tt" | "tw-frq";
export type DeviceStatus = "available" | "active" | "terminated_early" | "terminated";

export interface Device {
  id: string;
  serialNumber: string;
  type: DeviceType;
  typeCode: DeviceTypeCode;
  modules: string[];
  description: string;
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

export interface Application {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  deviceId: string;
  deviceSerialNumber: string;
  deviceType: string;
  rentalType: 3 | 6 | 12;
  payType: "monthly" | "full";
  payAmount: number;
  status: "pending" | "approved" | "rejected" | "payment_sent" | "completed" | "cancelled";
  identificationImageUrl: string;
  agreementPdfUrl?: string;
  paymentLinkId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PaymentLink {
  id: string;
  applicationId: string;
  userId: string;
  deviceId: string;
  serialNumber: string;
  deviceName: string;
  payType: "monthly" | "full";
  payAmount: number;
  cycle?: "MONTHLY";
  currentlyPayAmount?: number;
  recurringDayOfMonth?: 1 | 15;
  maxExecutionNumber?: number;
  payTimes?: 1;
  status: "pending" | "used" | "expired";
  expiresAt?: Timestamp;
  createdAt: Timestamp;
}

export interface Subscription {
  id: string;
  userId: string;
  deviceId: string;
  payType: "monthly" | "full";
  startAt: Timestamp;
  endAt: Timestamp;
  recurringId?: string;
  paymentId?: string;
  customerId: string;
  payAmount: number;
  status: "active" | "payment_failed" | "payment_delayed" | "completed" | "cancelled";
  delayMonths?: number;
  applicationId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Waitlist {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  deviceId: string;
  deviceType: string;
  status: "waiting" | "notified" | "cancelled";
  createdAt: Timestamp;
}

export interface UserProfile {
  uid: string;
  email: string;
  familyName: string;
  givenName: string;
  familyNameKana: string;
  givenNameKana: string;
  companyName?: string;
  zipcode?: string;
  prefectureCode?: string;
  address1?: string;
  address2?: string;
  invoiceNumber?: string;
  tel: string;
  role: "user" | "admin";
  customerId?: string;
  cardToken?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface News {
  id: string;
  title: string;
  body: string;
  status: "published" | "draft";
  publishedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SupportRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  deviceId?: string;
  type: "repair" | "support";
  description: string;
  imageUrls?: string[];
  status: "open" | "in_progress" | "resolved";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Coupon {
  id: string;
  name: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  status: "active" | "inactive";
  expiresAt?: Timestamp;
  maxUsesPerUser: number;
  maxTotalUsers: number;
  currentUsageCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  type: "application" | "transaction" | "news" | "waiting" | "general";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EmailTrigger {
  id: string;
  name: string;
  triggerPoint: string;
  templateId: string;
  enabled: boolean;
  createdAt: Timestamp;
}

export interface GlobalSettings {
  managerName: string;
  managerEmail: string;
  contactNumber: string;
  representativeName: string;
  companyName: string;
  zipcode: string;
  address: string;
  tel: string;
  mode: "test" | "production";
  firstpayTest?: {
    apiKey: string;
    bearerToken: string;
  };
  firstpayProd?: {
    apiKey: string;
    bearerToken: string;
  };
  updatedAt: Timestamp;
}
