'use client';

/**
 * @fileOverview FirstPay Payment API Client-side Implementation
 * Handles card tokenization, encryption (RSA), 3DS polling, and transaction management.
 * All functions respect the global configuration 'mode' (test/production).
 */

import { doc, getDoc, Firestore } from 'firebase/firestore';
import JSEncrypt from 'jsencrypt';

export interface CardInfo {
  cardNo: string;
  expireMonth: string;
  expireYear: string;
  holderName: string;
  cvv: string;
}

export interface FirstPayConfig {
  apiKey: string;
  bearerToken: string;
  mode: 'test' | 'production';
}

/**
 * Internal helper to get API Base URL based on mode
 */
const getApiBase = (mode: 'test' | 'production') => {
  return mode === "production"
    ? "https://www.api.firstpay.jp"
    : "https://dev.api.firstpay.jp";
};

/**
 * Internal helper to get headers for FirstPay API
 */
const getHeaders = (config: FirstPayConfig) => {
  return {
    "Content-Type": "application/json",
    "FIRSTPAY-PAYMENT-API-KEY": config.apiKey,
    "Authorization": `Bearer ${config.bearerToken}`
  };
};

/**
 * Fetches the global FirstPay configuration from Firestore
 */
export async function getFirstPayConfig(db: Firestore): Promise<FirstPayConfig | null> {
  const settingsRef = doc(db, 'settings', 'global');
  const snap = await getDoc(settingsRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  if (!data.firstpay) return null;
  return {
    apiKey: data.firstpay.apiKey || '',
    bearerToken: data.firstpay.bearerToken || '',
    mode: data.mode || 'test',
  };
}

/**
 * 5.1 & 5.2: Create a card token using FirstPay RSA encryption
 */
export async function createCardToken(config: FirstPayConfig, card: CardInfo): Promise<{ cardToken: string; issuerUrl?: string }> {
  const API_BASE = getApiBase(config.mode);
  const headers = getHeaders(config);

  // 1. Get encryption key
  const keyRes = await fetch(`${API_BASE}/token/encryption/key`, { method: "GET", headers });
  if (!keyRes.ok) throw new Error('Failed to fetch encryption key from FirstPay');
  const { keyHash, publicKey } = await keyRes.json();

  // 2. Encrypt card data
  const encrypt = new JSEncrypt();
  encrypt.setPublicKey(publicKey);
  const encryptedData = encrypt.encrypt(JSON.stringify(card));

  if (!encryptedData) throw new Error('Encryption failed');

  // 3. Issue token
  const tokenRes = await fetch(`${API_BASE}/token`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      encryptedData,
      encryptionKeyHash: keyHash,
      validateUsableCard: true,
      threedsConfiguration: {
        phone: { number: "09000000000", regionCode: "+81" }
      }
    })
  });

  const data = await tokenRes.json();
  if (data.errors && data.errors.length > 0) throw new Error(data.errors[0]?.message || 'Token generation failed');

  return {
    cardToken: data.cardToken,
    issuerUrl: data.threedsConfiguration?.issuerUrl
  };
}

/**
 * 5.3: Polls the status of a 3DS authentication
 */
export async function poll3dsStatus(config: FirstPayConfig, cardToken: string): Promise<boolean> {
  const API_BASE = getApiBase(config.mode);
  const headers = getHeaders(config);

  // Poll for up to 10 minutes (300 attempts x 2s)
  for (let i = 0; i < 300; i++) {
    const res = await fetch(`${API_BASE}/token/${cardToken}/status/three-ds`, { headers });
    const { status, errors } = await res.json();
    if (status === "AVAILABLE") return true;
    if (status === "NOT_AVAILABLE") {
      console.error('3DS Status Error:', errors);
      return false;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

/**
 * 5.4: Register customer
 */
export async function registerCustomer(config: FirstPayConfig, customerData: {
  customerId: string;
  cardToken: string;
  familyName: string;
  givenName: string;
  email: string;
  tel: string;
}) {
  const API_BASE = getApiBase(config.mode);
  const headers = getHeaders(config);

  const res = await fetch(`${API_BASE}/customer`, {
    method: "POST",
    headers,
    body: JSON.stringify(customerData)
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'Customer registration failed');
  return data;
}

/**
 * 5.6: Single charge (Full Payment)
 */
export async function createCharge(config: FirstPayConfig, chargeData: {
  customerId: string;
  paymentId: string;
  paymentName: string;
  amount: number;
}) {
  const API_BASE = getApiBase(config.mode);
  const headers = getHeaders(config);

  const res = await fetch(`${API_BASE}/charge`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...chargeData,
      payTimes: 1
    })
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'Charge execution failed');
  return data;
}

/**
 * 5.9: Recurring payment (Monthly Payment)
 */
export async function createRecurring(config: FirstPayConfig, recurringData: {
  reccuringId: string;
  paymentName: string;
  customerId: string;
  startAt: string; // YYYY-MM-DD
  payAmount: number;
  maxExecutionNumber: number;
  recurringDayOfMonth: 1 | 15;
}) {
  const API_BASE = getApiBase(config.mode);
  const headers = getHeaders(config);

  const res = await fetch(`${API_BASE}/recurring`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...recurringData,
      cycle: "MONTHLY",
      currentlyPayAmount: 0,
      notifyCustomerBeforeRecurring: false,
      notifyCustomerRecurred: false
    })
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'Recurring registration failed');
  return data;
}

/**
 * 5.12: Stop recurring payment
 */
export async function stopRecurring(config: FirstPayConfig, recurringId: string) {
  const API_BASE = getApiBase(config.mode);
  const headers = getHeaders(config);

  const res = await fetch(`${API_BASE}/recurring/${recurringId}`, {
    method: "DELETE",
    headers
  });
  return await res.json();
}
