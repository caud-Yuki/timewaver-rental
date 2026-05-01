import { Timestamp, DocumentData, FirestoreDataConverter, QueryDocumentSnapshot, SnapshotOptions, WithFieldValue, FieldValue } from 'firebase/firestore';

// Base type for write operations, allowing for server-generated timestamps
export type WithServerTimestamp<T> = {
  [K in keyof T]: T[K] | FieldValue;
};

// Existing types...
export type DeviceType = "TimeWaver Mobile" | "TimeWaver Mobile Quantum" | "TimeWaver Tabletop" | "TimeWaver Frequency";
export type DeviceTypeCode = "tw-m" | "tw-mq" | "tw-tt" | "tw-frq";
export type DeviceStatus = "available" | "active" | "processing" | "under_review" | "terminated_early" | "terminated";

export interface DeviceModule {
  id: string;
  name: string;
  point: number;
  order: number;
  description?: string;
  createdAt?: Timestamp;
}

export const deviceModuleConverter: FirestoreDataConverter<DeviceModule> = {
  toFirestore: (module: WithFieldValue<DeviceModule>): DocumentData => {
      return {
          name: module.name,
          point: module.point,
          order: module.order,
          description: module.description,
          ...(module.createdAt && { createdAt: module.createdAt })
      };
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): DeviceModule => {
      const data = snapshot.data(options);
      return {
          id: snapshot.id,
          name: data.name,
          point: data.point,
          order: data.order,
          description: data.description,
          createdAt: data.createdAt,
      };
  }
};

export interface Device {
  id: string;
  name: string; // Added name field
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
  imageUrls?: string[];
  isNew?: boolean;
  // Stripe integration — one Product per plan, two Prices per Product (monthly + full)
  stripeProducts?: {
    "3m": { productId?: string; monthlyPriceId?: string; fullPriceId?: string };
    "6m": { productId?: string; monthlyPriceId?: string; fullPriceId?: string };
    "12m": { productId?: string; monthlyPriceId?: string; fullPriceId?: string };
  };
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const deviceConverter: FirestoreDataConverter<Device> = {
    toFirestore: (device: WithFieldValue<Device>): DocumentData => {
        const { id, ...data } = device;
        return data;
    },
    fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): Device => {
        const data = snapshot.data(options);
        return {
            id: snapshot.id,
            name: data.name,
            serialNumber: data.serialNumber,
            type: data.type,
            typeCode: data.typeCode,
            modules: data.modules,
            description: data.description,
            fullPaymentDiscountRate: data.fullPaymentDiscountRate,
            price: data.price,
            status: data.status,
            currentUserId: data.currentUserId,
            contractStartAt: data.contractStartAt,
            contractEndAt: data.contractEndAt,
            imageUrl: data.imageUrl,
            imageUrls: data.imageUrls || [],
            stripeProducts: data.stripeProducts,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        } as Device;
    }
};

export interface UserProfile {
  id: string;
  email: string;
  role: 'user' | 'admin';
  familyName?: string;
  givenName?: string;
  tel?: string;
  zipcode?: string;
  address1?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const userProfileConverter: FirestoreDataConverter<UserProfile> = {
    toFirestore: (profile: WithFieldValue<UserProfile>): DocumentData => {
        const { id, ...data } = profile;
        return data;
    },
    fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): UserProfile => {
        const data = snapshot.data(options);
        return {
            id: snapshot.id,
            email: data.email,
            role: data.role,
            familyName: data.familyName,
            givenName: data.givenName,
            tel: data.tel,
            zipcode: data.zipcode,
            address1: data.address1,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        } as UserProfile;
    }
};

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'canceled';
export type RentalType = '3m' | '6m' | '12m';
export type PayType = 'monthly' | 'full';

export interface Application {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  deviceType: DeviceType;
  rentalPeriod?: RentalType;
  rentalType?: number;
  payType: PayType;
  status: ApplicationStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GlobalSettings {
  // Non-sensitive fields (stored in Firestore)
  waitlistEmailInterval: number;
  waitlistValidityHours: number;
  applicationSessionMinutes: number;
  updatedAt: Timestamp;
  companyName: string;
  managerName: string;
  managerEmail: string;
  mode: 'test' | 'production';
  serviceName?: string;
  companyPhone?: string;
  companyPostalCode?: string;
  companyPrefecture?: string;
  companyCity?: string;
  companyAddress?: string;
  companyBuilding?: string;
  geminiModel?: string;
  aiContext?: string;
  shippingBufferDays?: number;
  moduleBasePrice?: number;
  staff?: Array<{ name: string; email: string; role: 'operations' | 'support' | 'admin' }>;
  // Sensitive fields are stored in Google Cloud Secret Manager, NOT in Firestore.
  // See src/lib/secret-actions.ts for read/write operations.
}

export type WaitlistStatus = 'waiting' | 'notified' | 'scheduled' | 'expired' | 'converted';

// This is the shape of the data read from Firestore
export interface Waitlist {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  deviceType: DeviceType;
  deviceId?: string;
  status: WaitlistStatus; 
  createdAt: Timestamp;
  updatedAt?: Timestamp; 
  scheduledNotifyAt?: Timestamp; 
}

// For writing data, we can use a slightly different type
export type WaitlistWrite = Omit<Waitlist, 'id' | 'createdAt'> & { createdAt: FieldValue };


export const waitlistConverter: FirestoreDataConverter<Waitlist> = {
  toFirestore: (waitlist: WithFieldValue<Waitlist>): DocumentData => {
    // Omit 'id' as it's the document key
    const { id, ...data } = waitlist;
    return data;
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): Waitlist => {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      ...data
    } as Waitlist;
  },
};

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

export const mailAccountConverter: FirestoreDataConverter<MailAccount> = {
  toFirestore: (account: WithFieldValue<MailAccount>): DocumentData => {
    const { id, ...data } = account;
    return data;
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): MailAccount => {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      displayName: data.displayName,
      email: data.email,
      provider: data.provider,
      status: data.status,
      isDefault: data.isDefault ?? false,
      fromName: data.fromName,
      consecutiveFailures: data.consecutiveFailures ?? 0,
      lastError: data.lastError ?? null,
      createdBy: data.createdBy,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  },
};

// Added EmailTemplate and its converter
export interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    body: string;
    type: string;
    isAdmin?: boolean;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
}

export const emailTemplateConverter: FirestoreDataConverter<EmailTemplate> = {
  toFirestore: (template: WithFieldValue<EmailTemplate>): DocumentData => {
      return {
          name: template.name,
          subject: template.subject,
          body: template.body,
          type: template.type,
          isAdmin: template.isAdmin ?? false,
          updatedAt: template.updatedAt,
      };
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): EmailTemplate => {
      const data = snapshot.data(options);
      return {
          id: snapshot.id,
          name: data.name,
          subject: data.subject,
          body: data.body,
          type: data.type,
          isAdmin: data.isAdmin ?? false,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
      };
  }
};
