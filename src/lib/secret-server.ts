/**
 * @fileOverview Internal server-side secret readers.
 *
 * SERVER-ONLY, AND DELIBERATELY *NOT* A `'use server'` MODULE.
 *
 * These functions return raw credentials (Stripe live secret key, Stripe
 * webhook signing secret, Gemini API key). They used to live in
 * src/lib/secret-actions.ts, which carries the `'use server'` directive — that
 * made every one of them a public, unauthenticated RPC endpoint that any
 * visitor could invoke to exfiltrate production keys.
 *
 * They are consumed only by other server-side code (src/lib/stripe.ts and the
 * Genkit AI flows), never by the browser, so the correct fix is to keep them
 * off the Server Action surface altogether rather than to guard them.
 *
 * RULE: never add `'use server'` to this file, and never re-export these
 * functions from a module that has it. If the browser ever appears to need one
 * of these values, that is a bug — the value must stay on the server.
 */

import { getSecret, SECRET_NAMES } from '@/lib/secret-manager';

/** Fail loudly rather than silently shipping a secret reader to the client. */
if (typeof window !== 'undefined') {
  throw new Error('[secret-server] This module must never be imported into client-side code.');
}

export interface StripeSecretsResult {
  publishableKey: string;
  secretKey: string;
  mode: 'test' | 'production';
}

/**
 * Get Stripe API credentials from Secret Manager.
 * Reads the appropriate test/live credentials based on the mode parameter.
 */
export async function getStripeSecrets(mode: 'test' | 'production'): Promise<StripeSecretsResult | null> {
  try {
    const isTest = mode === 'test';
    const publishableKey = await getSecret(
      isTest ? SECRET_NAMES.STRIPE_TEST_PUBLISHABLE_KEY : SECRET_NAMES.STRIPE_LIVE_PUBLISHABLE_KEY
    );
    const secretKey = await getSecret(
      isTest ? SECRET_NAMES.STRIPE_TEST_SECRET_KEY : SECRET_NAMES.STRIPE_LIVE_SECRET_KEY
    );

    if (!publishableKey || !secretKey) return null;

    return { publishableKey, secretKey, mode };
  } catch (error: any) {
    console.error('[getStripeSecrets] Error:', error.message);
    return null;
  }
}

/**
 * Get the Stripe webhook signing secret for the given mode.
 * Tries the mode-specific secret first, then falls back to the legacy single secret
 * for backward compatibility with existing deployments.
 */
export async function getStripeWebhookSecret(mode: 'test' | 'production' = 'test'): Promise<string | null> {
  try {
    const modeSpecific = mode === 'test'
      ? SECRET_NAMES.STRIPE_TEST_WEBHOOK_SECRET
      : SECRET_NAMES.STRIPE_LIVE_WEBHOOK_SECRET;
    const value = await getSecret(modeSpecific);
    if (value) return value;
    // Fallback to legacy
    return await getSecret(SECRET_NAMES.STRIPE_WEBHOOK_SECRET);
  } catch (error: any) {
    console.error('[getStripeWebhookSecret] Error:', error.message);
    return null;
  }
}

/**
 * Get the Gemini API key from Secret Manager.
 * Falls back to environment variable GOOGLE_GENAI_API_KEY if not found.
 */
export async function getGeminiSecret(): Promise<string | null> {
  try {
    const key = await getSecret(SECRET_NAMES.GEMINI_API_KEY);
    if (key) return key;
  } catch (error: any) {
    console.warn('[getGeminiSecret] Secret Manager read failed, falling back to env var:', error.message);
  }

  // Fallback to environment variables for local development
  return process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || null;
}
