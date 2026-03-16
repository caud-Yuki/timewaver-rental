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
  // Ensure we don't double-prepend "Bearer "
  const rawToken = config.bearerToken.replace(/^Bearer\s+/i, '');
  return {
    "Content-Type": "application/json",
    "FIRSTPAY-PAYMENT-API-KEY": config.apiKey,
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
  const activeCreds = creds || data.firstpay;

  if (!activeCreds || !activeCreds.apiKey) {
    console.warn(`[PAYMENT_DEBUG] FirstPay credentials missing for mode: ${mode}`);
    return null;
  }
  
  console.log(`[PAYMENT_DEBUG] Config retrieved successfully for ${mode} mode`);
  return {
    apiKey: activeCreds.apiKey || '',
    bearerToken: activeCreds.bearerToken || '',
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
  
  if (!keyRes.ok) {
    const errText = await keyRes.text();
    console.error(`[PAYMENT_DEBUG] RSA Key Fetch Failed [Status: ${keyRes.status}]:`, errText);
    throw new Error(`Failed to fetch encryption key: ${keyRes.status}`);
  }

  const keyData = await keyRes.json();
  const { encryptionKeyHash, publicKey } = keyData;
  
  if (!encryptionKeyHash || !publicKey) {
    console.error('[PAYMENT_DEBUG] RSA Key response missing fields:', keyData);
    throw new Error('Invalid encryption key response from gateway');
  }

  console.log('[PAYMENT_DEBUG] RSA Key retrieved. Hash:', encryptionKeyHash);

  console.log('[PAYMENT_DEBUG] Encrypting card data...');
  const encrypt = new JSEncrypt();
  encrypt.setPublicKey(publicKey);
  const encryptedData = encrypt.encrypt(JSON.stringify(card));

  if (!encryptedData) {
    console.error('[PAYMENT_DEBUG] RSA Encryption failed locally');
    throw new Error('Local encryption failed');
  }

  console.log('[PAYMENT_DEBUG] Step 5.2: Issuing Card Token...');
  const tokenRes = await fetch(`${API_BASE}/token`, {
    method: "POST",
    headers,
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

  const data = await tokenRes.json();
  if (!tokenRes.ok || (data.errors && data.errors.length > 0)) {
    console.error(`[PAYMENT_DEBUG] Token Generation Failed [Status: ${tokenRes.status}]:`, data.errors || data);
    throw new Error(data.errors?.[0]?.message || `Token generation failed (${tokenRes.status})`);
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

  console.log(`[PAYMENT_DEBUG] Step 5.3: Polling 3DS status for token ${cardToken}...`);
  for (let i = 0; i < 300; i++) {
    const res = await fetch(`${API_BASE}/token/${cardToken}/status/three-ds`, { headers });
    const { status, errors } = await res.json();
    
    if (i % 5 === 0) console.log(`[PAYMENT_DEBUG] 3DS Polling Status (attempt ${i}):`, status);

    if (status === "AVAILABLE") {
      console.log('[PAYMENT_DEBUG] 3DS Auth Completed Successfully');
      return true;
    }
    if (status === "NOT_AVAILABLE") {
      console.error('[PAYMENT_DEBUG] 3DS Auth Failed or Cancelled:', errors);
      return false;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  console.error('[PAYMENT_DEBUG] 3DS Polling timed out after 10 minutes');
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

  console.log('[PAYMENT_DEBUG] Step 5.4: Registering/Updating Customer in FirstPay...', customerData.customerId);
  const res = await fetch(`${API_BASE}/customer`, {
    method: "POST",
    headers,
    body: JSON.stringify(customerData)
  });
  const data = await res.json();
  if (!res.ok || data.errors) {
    console.error(`[PAYMENT_DEBUG] Customer Registration Failed [Status: ${res.status}]:`, data.errors || data);
    throw new Error(data.errors?.[0]?.message || 'Customer registration failed');
  }
  console.log('[PAYMENT_DEBUG] Customer Registration Success');
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

  console.log('[PAYMENT_DEBUG] Step 5.6: Executing One-time Charge...', chargeData.paymentId);
  const res = await fetch(`${API_BASE}/charge`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...chargeData,
      payTimes: 1
    })
  });
  const data = await res.json();
  if (!res.ok || data.errors) {
    console.error(`[PAYMENT_DEBUG] Charge Execution Failed [Status: ${res.status}]:`, data.errors || data);
    throw new Error(data.errors?.[0]?.message || 'Charge execution failed');
  }
  console.log('[PAYMENT_DEBUG] Charge Success. Status:', data.paymentStatus);
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

  console.log('[PAYMENT_DEBUG] Step 5.9: Registering Recurring Payment...', recurringData.reccuringId);
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
  if (!res.ok || data.errors) {
    console.error(`[PAYMENT_DEBUG] Recurring Registration Failed [Status: ${res.status}]:`, data.errors || data);
    throw new Error(data.errors?.[0]?.message || 'Recurring registration failed');
  }
  console.log('[PAYMENT_DEBUG] Recurring Success. Next run:', data.nextRecurringAt);
  return data;
}
