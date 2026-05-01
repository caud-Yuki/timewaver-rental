import type { Timestamp, FieldValue } from "firebase-admin/firestore";

export type MailAccountProvider = "gmail_oauth" | "smtp";
export type MailAccountStatus = "active" | "pending_oauth" | "unauthorized" | "revoked";

export interface MailAccount {
  displayName: string;
  email: string;
  provider: MailAccountProvider;
  status: MailAccountStatus;
  isDefault: boolean;
  fromName?: string;
  consecutiveFailures?: number;
  lastError?: string | null;
  createdBy?: string;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

export interface MailAccountPublic {
  id: string;
  displayName: string;
  email: string;
  provider: MailAccountProvider;
  status: MailAccountStatus;
  isDefault: boolean;
  fromName?: string;
  consecutiveFailures?: number;
  lastError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface MailGmailToken {
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  scope: string;
  tokenType?: string;
  expiryDate?: number | null;
  kmsKeyVersion: string;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

export interface MailSmtpCredential {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  encryptedPassword: string;
  kmsKeyVersion: string;
  fromName?: string;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

export interface OAuthState {
  uid: string;
  accountId: string;
  mode: "create" | "reauth";
  expiresAt: Timestamp | FieldValue;
  scope: "gmail";
}

export interface MailSendInput {
  to: string;
  subject: string;
  body: string;
  isAdmin?: boolean;
  fromAccountId?: string;
}
