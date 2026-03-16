'use client';

/**
 * @fileOverview FirstPay Payment API Client-side Implementation
 * Refined to match the exact flow:
 * 1. RSA Key Acquisition (GET /token/encryption/key)
 * 2. Token Generation (POST /token) - NO Authorization header
 * 3. Member Registration (POST /customer)
 * 4. Pattern A: Charge (POST /charge) OR Pattern B: Recurring (POST /recurring)
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
 * Fetches the global FirstPay configuration from Firestore
 */
export async function getFirstPayConfig(db: Firestore): Promise<FirstPayConfig | null> {
  const settingsRef = doc(db, 'settings', 'global');
  const snap = await getDoc(settingsRef);
  
  if (!snap.exists()) return null;
  
  const data = snap.data();
  const mode = data.mode || 'test';
  const creds = mode === 'production' ? data.firstpayProd : data.firstpayTest;
  
  if (!creds || !creds.apiKey?.trim() || !creds.bearerToken?.trim()) return null;
  
  return {
    apiKey: creds.apiKey.trim(),
    bearerToken: creds.bearerToken.trim(),
    mode: mode as 'test' | 'production',
  };
}

/**
 * Steps 2 & 3: Acquire RSA Key and Generate Card Token
 */
export async function createCardToken(config: FirstPayConfig, card: CardInfo, phone?: string): Promise<{ cardToken: string; issuerUrl?: string }> {
  const API_BASE = getApiBase(config.mode);
  
  // Step 2: Acquire RSA Key (Requires Auth header)
  console.log('[PAYMENT_DEBUG] Fetching RSA Key...');
  const keyRes = await fetch(`${API_BASE}/token/encryption/key`, { 
    method: "GET", 
    headers: getHeaders(config) 
  });
  
  if (!keyRes.ok) {
    const errText = await keyRes.text();
    throw new Error(`RSAキー取得失敗 (${keyRes.status}): ${errText}`);
  }
  
  const keyData = await keyRes.json();
  const { keyHash, publicKey } = keyData;

  if (!keyHash || !publicKey) {
    throw new Error('RSAレスポンスに必要なフィールドが含まれていません。');
  }

  // Encrypt card data
  const encrypt = new JSEncrypt();
  encrypt.setPublicKey(publicKey);
  const encryptedData = encrypt.encrypt(JSON.stringify({
    cardNo: card.cardNo,
    expireMonth: card.expireMonth,
    expireYear: card.expireYear,
    holderName: card.holderName,
    cvv: card.cvv
  }));

  if (!encryptedData) throw new Error('カード情報の暗号化に失敗しました。');

  // Step 3: Generate Token (NO Authorization header as per docs)
  console.log('[PAYMENT_DEBUG] Issuing Card Token...');
  const tokenRes = await fetch(`${API_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "FIRSTPAY-PAYMENT-API-KEY": config.apiKey.trim()
    },
    body: JSON.stringify({
      encryptedData,
      encryptionKeyHash: keyHash, // Documentation maps keyHash to encryptionKeyHash
      validateUsableCard: true,
      threedsConfiguration: {
        phone: { 
          number: phone?.replace(/[^0-9]/g, '') || "09000000000", 
          regionCode: "+81" 
        }
      }
    })
  });

  const data = await tokenRes.json();
  
  if (!tokenRes.ok || data.errors) {
    console.error('[PAYMENT_DEBUG] Token Gen Error:', data);
    const firstMsg = Array.isArray(data.errors) ? data.errors[0]?.message : 'トークン発行失敗';
    throw new Error(`${firstMsg} (${tokenRes.status})`);
  }

  return {
    cardToken: data.cardToken,
    issuerUrl: data.threedsConfiguration?.issuerUrl
  };
}

/**
 * Step 5.3: Polls the status of a 3DS authentication
 */
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

/**
 * ① 会員登録API
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
  const res = await fetch(`${API_BASE}/customer`, {
    method: "POST",
    headers: getHeaders(config),
    body: JSON.stringify(customerData)
  });
  if (!res.ok) throw new Error(`会員登録失敗 (${res.status})`);
  return await res.json();
}

/**
 * ④-A 決済API (Pattern 1: Full Pay)
 */
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
  if (!res.ok) throw new Error(`都度決済失敗 (${res.status})`);
  return await res.json();
}

/**
 * ④-B 継続決済登録API (Pattern 2: Monthly Pay)
 */
export async function createRecurring(config: FirstPayConfig, recurringData: {
  reccuringId: string;
  paymentName: string;
  customerId: string;
  startAt: string; // yyyy-MM-dd
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
  if (!res.ok) throw new Error(`継続決済登録失敗 (${res.status})`);
  return await res.json();
}
