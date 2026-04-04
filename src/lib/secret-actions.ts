'use server';

/**
 * @fileOverview Server actions for reading/writing secrets via Google Cloud Secret Manager.
 * These actions run on the server and are safe to call from client components.
 */

import { getSecret, setSecret, SECRET_NAMES } from '@/lib/secret-manager';

// --- Types ---

export interface SecretPayload {
  stripeTestPublishableKey?: string;
  stripeTestSecretKey?: string;
  stripeLivePublishableKey?: string;
  stripeLiveSecretKey?: string;
  stripeWebhookSecret?: string;
  geminiApiKey?: string;
  chatworkApiToken?: string;
  chatworkRoomId?: string;
  googleChatWebhookUrl?: string;
}

export interface StripeSecretsResult {
  publishableKey: string;
  secretKey: string;
  mode: 'test' | 'production';
}

// --- Write Secrets ---

/**
 * Save multiple secrets to Google Cloud Secret Manager.
 * Only non-empty values are written (skips blank fields to avoid overwriting existing secrets).
 */
export async function saveSecrets(payload: SecretPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const entries: [string, string | undefined][] = [
      [SECRET_NAMES.STRIPE_TEST_PUBLISHABLE_KEY, payload.stripeTestPublishableKey],
      [SECRET_NAMES.STRIPE_TEST_SECRET_KEY, payload.stripeTestSecretKey],
      [SECRET_NAMES.STRIPE_LIVE_PUBLISHABLE_KEY, payload.stripeLivePublishableKey],
      [SECRET_NAMES.STRIPE_LIVE_SECRET_KEY, payload.stripeLiveSecretKey],
      [SECRET_NAMES.STRIPE_WEBHOOK_SECRET, payload.stripeWebhookSecret],
      [SECRET_NAMES.GEMINI_API_KEY, payload.geminiApiKey],
      [SECRET_NAMES.CHATWORK_API_TOKEN, payload.chatworkApiToken],
      [SECRET_NAMES.CHATWORK_ROOM_ID, payload.chatworkRoomId],
      [SECRET_NAMES.GOOGLE_CHAT_WEBHOOK_URL, payload.googleChatWebhookUrl],
    ];

    for (const [name, value] of entries) {
      if (value && value.trim()) {
        await setSecret(name, value.trim());
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('[saveSecrets] Error:', error.message);
    return { success: false, error: error.message };
  }
}

// --- Read Secrets ---

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
 * Get the Stripe webhook secret from Secret Manager.
 */
export async function getStripeWebhookSecret(): Promise<string | null> {
  try {
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

  // Fallback to environment variable for local development
  return process.env.GOOGLE_GENAI_API_KEY || null;
}

/**
 * Check which secrets are currently configured (returns masked status, never raw values).
 * Used by the admin settings page to show which fields are set.
 */
export async function getSecretsStatus(): Promise<Record<string, boolean>> {
  try {
    const results = await Promise.all([
      getSecret(SECRET_NAMES.STRIPE_TEST_PUBLISHABLE_KEY),
      getSecret(SECRET_NAMES.STRIPE_TEST_SECRET_KEY),
      getSecret(SECRET_NAMES.STRIPE_LIVE_PUBLISHABLE_KEY),
      getSecret(SECRET_NAMES.STRIPE_LIVE_SECRET_KEY),
      getSecret(SECRET_NAMES.STRIPE_WEBHOOK_SECRET),
      getSecret(SECRET_NAMES.GEMINI_API_KEY),
      getSecret(SECRET_NAMES.CHATWORK_API_TOKEN),
      getSecret(SECRET_NAMES.CHATWORK_ROOM_ID),
      getSecret(SECRET_NAMES.GOOGLE_CHAT_WEBHOOK_URL),
    ]);

    return {
      stripeTestPublishableKey: !!results[0],
      stripeTestSecretKey: !!results[1],
      stripeLivePublishableKey: !!results[2],
      stripeLiveSecretKey: !!results[3],
      stripeWebhookSecret: !!results[4],
      geminiApiKey: !!results[5],
      chatworkApiToken: !!results[6],
      chatworkRoomId: !!results[7],
      googleChatWebhookUrl: !!results[8],
    };
  } catch (error) {
    return {
      stripeTestPublishableKey: false,
      stripeTestSecretKey: false,
      stripeLivePublishableKey: false,
      stripeLiveSecretKey: false,
      stripeWebhookSecret: false,
      geminiApiKey: false,
      chatworkApiToken: false,
      chatworkRoomId: false,
      googleChatWebhookUrl: false,
    };
  }
}
