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
  const url = mode === "production"
    ? "https://www.api.firstpay.jp"
    : "https://dev.api.firstpay.jp";
  console.log(`[PAYMENT_DEBUG] API Base set to: ${url} (Mode: ${mode})`);
  return url;
};

/**
 * Internal helper to get headers for FirstPay API.
 * Handles bearer token format robustly.
 */
const getHeaders = (config: FirstPayConfig) => {
  const rawToken = config.bearerToken?.trim().replace(/^Bearer\s+/i, '') || '';
  const apiKey = config.apiKey?.trim() || '';
  
  return {
    "Content-Type": "application/json",
    "FIRSTPAY-PAYMENT-API-KEY": apiKey,
    "Authorization": `Bearer ${rawToken}`
  };
};

/**
 * Fetches the global FirstPay configuration from Firestore
 */
export async function getFirstPayConfig(db: Firestore): Promise<FirstPayConfig | null> {
  console.log('[PAYMENT_DEBUG] Fetching FirstPay config from Firestore...');
  const settingsRef = doc(db, 'settings', 'global');
  const snap = await getDoc(settingsRef);
  
  if (!snap.exists()) {
    console.warn('[PAYMENT_DEBUG] Config document not found at settings/global');
    return null;
  }
  
  const data = snap.data();
  const mode = data.mode || 'test';
  const creds = mode === 'production' ? data.firstpayProd : data.firstpayTest;
  
  if (!creds || !creds.apiKey?.trim() || !creds.bearerToken?.trim()) {
    console.warn(`[PAYMENT_DEBUG] FirstPay credentials missing or empty for mode: ${mode}`);
    return null;
  }
  
  console.log(`[PAYMENT_DEBUG] Config retrieved successfully for ${mode} mode`);
  return {
    apiKey: creds.apiKey.trim(),
    bearerToken: creds.bearerToken.trim(),
    mode: mode as 'test' | 'production',
  };
}

/**
 * 5.1 & 5.2: Create a card token using FirstPay RSA encryption
 */
export async function createCardToken(config: FirstPayConfig, card: CardInfo, phone?: string): Promise<{ cardToken: string; issuerUrl?: string }> {
  const API_BASE = getApiBase(config.mode);
  const headers = getHeaders(config);

  console.log('[PAYMENT_DEBUG] Step 5.1: Fetching RSA Encryption Key...');
  const keyRes = await fetch(`${API_BASE}/token/encryption/key`, { method: "GET", headers });
  
  const keyData = await keyRes.json().catch(() => ({}));
  if (!keyRes.ok) {
    console.error(`[PAYMENT_DEBUG] RSA Key Fetch Failed [Status: ${keyRes.status}]:`, keyData);
    throw new Error(`RSAキー取得失敗: ${keyRes.status}`);
  }

  // Support both 'keyHash' (manual) and 'encryptionKeyHash' (potential API variation)
  const encryptionKeyHash = (keyData.keyHash || keyData.encryptionKeyHash)?.trim();
  const publicKey = keyData.publicKey?.trim();
  
  if (!encryptionKeyHash || !publicKey) {
    console.error('[PAYMENT_DEBUG] RSA Key response missing fields:', keyData);
    throw new Error('決済ゲートウェイから有効な暗号化キーを取得できませんでした。');
  }

  console.log('[PAYMENT_DEBUG] RSA Key retrieved successfully. Hash:', encryptionKeyHash);

  const encrypt = new JSEncrypt();
  encrypt.setPublicKey(publicKey);
  const encryptedData = encrypt.encrypt(JSON.stringify(card));

  if (!encryptedData) {
    throw new Error('カードデータの暗号化に失敗しました。');
  }

  console.log('[PAYMENT_DEBUG] Step 5.2: Issuing Card Token...');
  const tokenRes = await fetch(`${API_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "FIRSTPAY-PAYMENT-API-KEY": config.apiKey.trim()
    },
    body: JSON.stringify({
      encryptedData,
      encryptionKeyHash,
      validateUsableCard: true,
      threedsConfiguration: {
        phone: { 
          number: phone?.replace(/[^0-9]/g, '') || "09000000000", 
          regionCode: "+81" 
        }
      }
    })
  });

  const data = await tokenRes.json().catch(() => ({}));
  
  if (!tokenRes.ok || data.errors) {
    console.error(`[PAYMENT_DEBUG] Token Generation Failed [Status: ${tokenRes.status}]:`, data.errors || data);
    
    // Extract first error message from potential array or object structure
    let errorMsg = 'カードトークンの発行に失敗しました。';
    if (data.errors) {
      if (Array.isArray(data.errors)) {
        errorMsg = data.errors[0]?.message || errorMsg;
      } else if (typeof data.errors === 'object') {
        const firstErrKey = Object.keys(data.errors)[0];
        const errVal = data.errors[firstErrKey];
        errorMsg = Array.isArray(errVal) ? errVal[0] : (typeof errVal === 'string' ? errVal : errorMsg);
      }
    }
    
    throw new Error(`${errorMsg} (${tokenRes.status})`);
  }

  if (!data.cardToken) {
    throw new Error('レスポンスにカードトークンが含まれていません。');
  }

  console.log('[PAYMENT_DEBUG] Token response received. cardToken:', data.cardToken);
  
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

  console.log(`[PAYMENT_DEBUG] Step 5.3: Polling 3DS status...`);
  for (let i = 0; i < 300; i++) {
    const res = await fetch(`${API_BASE}/token/${cardToken}/status/three-ds`, { headers });
    const resData = await res.json().catch(() => ({}));
    const { status } = resData;
    
    if (i % 10 === 0) console.log(`[PAYMENT_DEBUG] 3DS Status:`, status);

    if (status === "AVAILABLE") return true;
    if (status === "NOT_AVAILABLE") return false;
    
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors) {
    console.error(`[PAYMENT_DEBUG] Customer Registration Failed:`, data);
    throw new Error('顧客登録に失敗しました。');
  }
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
    body: JSON.stringify({ ...chargeData, payTimes: 1 })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors) {
    console.error(`[PAYMENT_DEBUG] Charge Execution Failed:`, data);
    throw new Error('決済の実行に失敗しました。');
  }
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors) {
    console.error(`[PAYMENT_DEBUG] Recurring Registration Failed:`, data);
    throw new Error('継続決済の登録に失敗しました。');
  }
  return data;
}
