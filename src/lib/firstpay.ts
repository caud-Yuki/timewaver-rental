'use client';

/**
 * @fileOverview FirstPay Payment API Client-side Implementation
 * Refined to match strict formatting requirements for encryptedData.
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

const getApiBase = (mode: 'test' | 'production') => {
  return mode === "production"
    ? "https://www.api.firstpay.jp"
    : "https://dev.api.firstpay.jp";
};

const getHeaders = (config: FirstPayConfig) => {
  const rawToken = config.bearerToken?.trim().replace(/^Bearer\s+/i, '') || '';
  return {
    "Content-Type": "application/json",
    "FIRSTPAY-PAYMENT-API-KEY": config.apiKey.trim(),
    "Authorization": `Bearer ${rawToken}`
  };
};

/**
 * Intelligent error parser for FirstPay gateway responses.
 */
const parseGatewayError = (data: any, status: number) => {
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors[0].message || 'API Error';
  }
  
  // Look for field-specific validation errors (e.g., { encryptedData: ["error message"] })
  for (const key in data) {
    if (Array.isArray(data[key]) && data[key].length > 0) {
      return `${key}: ${data[key][0]}`;
    }
    if (typeof data[key] === 'string' && !['cardToken', 'keyHash', 'publicKey'].includes(key)) {
      return `${key}: ${data[key]}`;
    }
  }

  return `Gateway Error (${status})`;
};

export async function getFirstPayConfig(db: Firestore): Promise<FirstPayConfig | null> {
  const settingsRef = doc(db, 'settings', 'global');
  const snap = await getDoc(settingsRef);
  
  if (!snap.exists()) return null;
  
  const data = snap.data();
  const mode = data.mode || 'test';
  const creds = mode === 'production' ? data.firstpayProd : data.firstpayTest;
  
  if (!creds || !creds.apiKey?.trim() || !creds.bearerToken?.trim()) {
    return null;
  }
  
  return {
    apiKey: creds.apiKey.trim(),
    bearerToken: creds.bearerToken.trim(),
    mode: mode as 'test' | 'production',
  };
}

/**
 * Sequence: RSA Acquisition -> Token Generation
 */
export async function createCardToken(config: FirstPayConfig, card: CardInfo): Promise<{ cardToken: string; issuerUrl?: string }> {
  const API_BASE = getApiBase(config.mode);
  
  // 1. RSA Key Acquisition
  const keyRes = await fetch(`${API_BASE}/token/encryption/key`, { 
    method: "GET", 
    headers: getHeaders(config) 
  });
  
  if (!keyRes.ok) {
    const errText = await keyRes.text();
    console.error(`[PAYMENT_DEBUG] RSA Key Fetch Failed [${keyRes.status}]:`, errText);
    throw new Error(`暗号化キー取得失敗 (${keyRes.status})`);
  }
  
  const keyData = await keyRes.json();
  const { keyHash, publicKey } = keyData;

  if (!keyHash || !publicKey) {
    throw new Error('Invalid encryption key response from gateway');
  }

  // 2. Encrypt Card Info with strict formatting
  const encrypt = new JSEncrypt();
  encrypt.setPublicKey(publicKey);
  
  // Ensure strict formatting as per documentation: MM, yyyy, digits only
  const formattedMonth = card.expireMonth.replace(/\D/g, '').padStart(2, '0');
  const formattedYear = card.expireYear.replace(/\D/g, '');
  const fullYear = formattedYear.length === 2 ? `20${formattedYear}` : formattedYear;

  const jsonToEncrypt = JSON.stringify({
    cardNo: card.cardNo.replace(/\D/g, ''),
    expireMonth: formattedMonth,
    expireYear: fullYear,
    holderName: card.holderName.trim().toUpperCase().substring(0, 50),
    cvv: card.cvv.replace(/\D/g, '')
  });
  
  const encryptedData = encrypt.encrypt(jsonToEncrypt);
  if (!encryptedData) throw new Error('カード情報の暗号化に失敗しました。');

  // 3. Token Generation (Auth header NOT required here as per docs)
  const tokenRes = await fetch(`${API_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "FIRSTPAY-PAYMENT-API-KEY": config.apiKey.trim()
    },
    body: JSON.stringify({
      encryptedData,
      encryptionKeyHash: keyHash, // Map keyHash from response to encryptionKeyHash in request
      validateUsableCard: false 
    })
  });

  const data = await tokenRes.json();
  
  if (!tokenRes.ok || data.errors) {
    console.error('[PAYMENT_DEBUG] Token Generation Failed:', data);
    const errorMsg = parseGatewayError(data, tokenRes.status);
    throw new Error(`${errorMsg} (${tokenRes.status})`);
  }

  return {
    cardToken: data.cardToken,
    issuerUrl: data.threedsConfiguration?.issuerUrl
  };
}

export async function poll3dsStatus(config: FirstPayConfig, cardToken: string): Promise<boolean> {
  const API_BASE = getApiBase(config.mode);
  const headers = getHeaders(config);

  for (let i = 0; i < 300; i++) {
    const res = await fetch(`${API_BASE}/token/${cardToken}/status/three-ds`, { headers });
    const resData = await res.json();
    if (resData.status === "AVAILABLE") return true;
    if (resData.status === "NOT_AVAILABLE") return false;
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

export async function registerCustomer(config: FirstPayConfig, customerData: {
  customerId: string;
  cardToken: string;
  familyName: string;
  givenName: string;
  email: string;
  tel: string;
}) {
  const API_BASE = getApiBase(config.mode);
  const res = await fetch(`${API_BASE}/customer`, {
    method: "POST",
    headers: getHeaders(config),
    body: JSON.stringify({
      ...customerData,
      tel: customerData.tel.replace(/[^\d-]/g, '') // Only digits and hyphens
    })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(parseGatewayError(data, res.status));
  return data;
}

export async function createCharge(config: FirstPayConfig, chargeData: {
  customerId: string;
  paymentId: string;
  paymentName: string;
  amount: number;
}) {
  const API_BASE = getApiBase(config.mode);
  const res = await fetch(`${API_BASE}/charge`, {
    method: "POST",
    headers: getHeaders(config),
    body: JSON.stringify({ ...chargeData, payTimes: 1 })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(parseGatewayError(data, res.status));
  return data;
}

export async function createRecurring(config: FirstPayConfig, recurringData: {
  reccuringId: string;
  paymentName: string;
  customerId: string;
  startAt: string;
  payAmount: number;
  currentlyPayAmount: number;
  recurringDayOfMonth?: number;
  maxExecutionNumber?: number;
}) {
  const API_BASE = getApiBase(config.mode);
  const res = await fetch(`${API_BASE}/recurring`, {
    method: "POST",
    headers: getHeaders(config),
    body: JSON.stringify({
      ...recurringData,
      cycle: "MONTHLY",
      notifyCustomerBeforeRecurring: false,
      notifyCustomerRecurred: false
    })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(parseGatewayError(data, res.status));
  return data;
}