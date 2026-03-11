'use client';

/**
 * @fileOverview FirstPay Payment API Client-side Utility
 * Handles card tokenization, encryption (RSA), and 3DS polling logic.
 */

import { doc, getDoc, Firestore } from 'firebase/firestore';

export interface CardInfo {
  cardNo: string;
  expireMonth: string;
  expireYear: string;
  holderName: string;
  cvv: string;
}

export interface FirstPayConfig {
  apiKey: string;
  mode: 'test' | 'production';
}

/**
 * Fetches the global FirstPay configuration from Firestore
 */
export async function getFirstPayConfig(db: Firestore): Promise<FirstPayConfig | null> {
  const settingsRef = doc(db, 'settings', 'global');
  const snap = await getDoc(settingsRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    apiKey: data.firstpay?.apiKey || '',
    mode: data.mode || 'test',
  };
}

/**
 * Simulates FirstPay Card Tokenization
 * In a real implementation, this would:
 * 1. Get public key from FirstPay
 * 2. Encrypt card data using JSEncrypt
 * 3. POST to /token endpoint
 * 4. Handle 3DS redirect if necessary
 */
export async function createCardToken(config: FirstPayConfig, card: CardInfo): Promise<{ cardToken: string; issuerUrl?: string }> {
  console.log('Initiating FirstPay tokenization for:', config.mode);
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // In production, we'd use actual FirstPay endpoints
  // const API_BASE = config.mode === 'production' ? 'https://www.api.firstpay.jp' : 'https://dev.api.firstpay.jp';
  
  // Return a mock token for development
  return {
    cardToken: `tok_simulated_${Math.random().toString(36).substring(7)}`,
    // issuerUrl: 'https://...', // If 3DS is required
  };
}

/**
 * Polls the status of a 3DS authentication
 */
export async function poll3dsStatus(cardToken: string): Promise<boolean> {
  // Simulate polling logic
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    // Simulate success after 2 polls
    if (i >= 1) return true;
  }
  return false;
}
