'use client';

/**
 * @fileOverview Stripe Payment Client-side Implementation
 *
 * Stripe Elements を使用してカード情報を安全に処理する。
 * - カード情報がアプリケーションのJSに一切触れないため、PCI DSS準拠。
 * - 3DS認証はStripe Elementsが自動的にハンドルする。
 */

import { doc, getDoc, Firestore } from 'firebase/firestore';
import { getStripeSecrets } from '@/lib/secret-actions';
import { loadStripe, Stripe } from '@stripe/stripe-js';

// --- Types ---

export interface StripeConfig {
  publishableKey: string;
  mode: 'test' | 'production';
}

// --- Singleton ---

let stripePromise: Promise<Stripe | null> | null = null;

// --- Config ---

/**
 * Get Stripe configuration.
 * Reads the mode (test/production) from Firestore, then fetches
 * the publishable key from Google Cloud Secret Manager.
 */
export async function getStripeConfig(db: Firestore): Promise<StripeConfig | null> {
  const settingsRef = doc(db, 'settings', 'global');
  const snap = await getDoc(settingsRef);

  if (!snap.exists()) return null;

  const data = snap.data();
  const mode = (data.mode || 'test') as 'test' | 'production';

  const secrets = await getStripeSecrets(mode);
  if (!secrets) return null;

  return {
    publishableKey: secrets.publishableKey,
    mode,
  };
}

/**
 * Get or create a Stripe.js instance (singleton).
 * Call this once with the publishable key, then reuse.
 */
export function getStripeInstance(publishableKey: string): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

/**
 * Reset the Stripe instance (e.g., when switching test/production mode).
 */
export function resetStripeInstance(): void {
  stripePromise = null;
}
