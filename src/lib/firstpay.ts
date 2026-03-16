'use client';

/**
 * @fileOverview FirstPay Payment API Client-side Implementation
 * 1. RSA Key Acquisition (GET /token/encryption/key)
 * 2. Token Generation (POST /token) - ONLY API-KEY required
 * 3. Member Registration (POST /customer)
 * 4. Execute Payment (POST /charge or /recurring)
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
 * Helper to parse gateway errors intelligently
 */
const parseGatewayError = (data: any, status: number) => {
  // 1. Look for standard errors array
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors[0].message || 'API Error';
  }
  
  // 2. Look for field-specific errors (e.g., encryptedData: ["..."])
  const fieldErrors = Object.keys(data).filter(k => Array.isArray(data[k]));
  if (fieldErrors.length > 0) {
    const firstField = fieldErrors[0];
    return `${firstField}: ${data[firstField][0]}`;
  }

  // 3. Fallback
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
  
  // 1. RSA Key Acquisition (Requires API-KEY + Auth header)
  console.log('[PAYMENT_DEBUG] Step 1: Fetching RSA Encryption Key...');
  const keyRes = await fetch(`${API_BASE}/token/encryption/key`, { 
    method: "GET", 
    headers: getHeaders(config) 
  });
  
  if (!keyRes.ok) {
    const errText = await keyRes.text();
    console.error(`[PAYMENT_DEBUG] RSA Key Fetch Failed [Status: ${keyRes.status}]:`, errText);
    throw new Error(`暗号化キー取得失敗 (${keyRes.status})`);
  }
  
  const keyData = await keyRes.json();
  const { keyHash, publicKey } = keyData;

  if (!keyHash || !publicKey) {
    console.error('[PAYMENT_DEBUG] RSA Key response missing fields:', keyData);
    throw new Error('暗号化キーのレスポンスが不正です。');
  }

  // 2. Encrypt Card Info
  const encrypt = new JSEncrypt();
  encrypt.setPublicKey(publicKey);
  const jsonToEncrypt = JSON.stringify({
    cardNo: card.cardNo.replace(/\s/g, ''),
    expireMonth: card.expireMonth.padStart(2, '0'),
    expireYear: card.expireYear.length === 2 ? `20${card.expireYear}` : card.expireYear, // Ensure yyyy
    holderName: card.holderName.trim().toUpperCase(),
    cvv: card.cvv.trim()
  });
  
  const encryptedData = encrypt.encrypt(jsonToEncrypt);
  if (!encryptedData) throw new Error('カード情報の暗号化に失敗しました。');

  // 3. Token Generation (Requires ONLY API-KEY)
  console.log('[PAYMENT_DEBUG] Step 2: Issuing Card Token...');
  const tokenRes = await fetch(`${API_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "FIRSTPAY-PAYMENT-API-KEY": config.apiKey.trim()
    },
    body: JSON.stringify({
      encryptedData,
      encryptionKeyHash: keyHash.trim(),
      validateUsableCard: false 
    })
  });

  const data = await tokenRes.json();
  
  if (!tokenRes.ok || data.errors) {
    console.error('[PAYMENT_DEBUG] Token Generation Failed:', data);
    const errorMsg = parseGatewayError(data, tokenRes.status);
    throw new Error(`${errorMsg} (${tokenRes.status})`);
  }

  console.log('[PAYMENT_DEBUG] Token issued successfully:', data.cardToken);

  return {
    cardToken: data.cardToken,
    issuerUrl: data.threedsConfiguration?.issuerUrl
  };
}

export async function poll3dsStatus(config: FirstPayConfig, cardToken: string): Promise<boolean> {
  const API_BASE = getApiBase(config.mode);
  const headers = getHeaders(config);

  console.log('[PAYMENT_DEBUG] Polling 3DS status...');
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
    body: JSON.stringify(customerData)
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
