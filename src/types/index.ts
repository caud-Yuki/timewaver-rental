
export type DeviceType = "TimeWaver Mobile" | "TimeWaver Mobile Quantum" | "TimeWaver Tabletop" | "TimeWaver Frequency";
export type DeviceTypeCode = "tw-m" | "tw-mq" | "tw-tt" | "tw-frq";
export type DeviceStatus = "available" | "active" | "maintenance";

export interface Device {
  id: string;
  serialNumber: string;
  type: DeviceType;
  typeCode: DeviceTypeCode;
  description: string;
  price: {
    "3m": { full: number; monthly: number };
    "6m": { full: number; monthly: number };
    "12m": { full: number; monthly: number };
  };
  status: DeviceStatus;
  createdAt?: any;
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
  status: "pending" | "approved" | "rejected" | "payment_sent" | "completed";
  zip: string;
  tel: string;
  address: string;
  createdAt: any;
  updatedAt: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  familyName: string;
  givenName: string;
  role: "user" | "admin";
  tel?: string;
  createdAt: any;
  updatedAt: any;
}
