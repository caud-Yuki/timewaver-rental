'use server';

/**
 * @fileOverview Server actions for reading/writing secrets via Google Cloud Secret Manager.
 * These actions run on the server and are safe to call from client components.
 */

import { getSecret, setSecret, SECRET_NAMES } from '@/lib/secret-manager';

// --- Types ---

export interface SecretPayload {
  firstpayTestApiKey?: string;
  firstpayTestBearerToken?: string;
  firstpayProdApiKey?: string;
  firstpayProdBearerToken?: string;
  geminiApiKey?: string;
  chatworkApiToken?: string;
  chatworkRoomId?: string;
  googleChatWebhookUrl?: string;
}

export interface FirstPaySecretsResult {
  apiKey: string;
  bearerToken: string;
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
      [SECRET_NAMES.FIRSTPAY_TEST_API_KEY, payload.firstpayTestApiKey],
      [SECRET_NAMES.FIRSTPAY_TEST_BEARER_TOKEN, payload.firstpayTestBearerToken],
      [SECRET_NAMES.FIRSTPAY_PROD_API_KEY, payload.firstpayProdApiKey],
      [SECRET_NAMES.FIRSTPAY_PROD_BEARER_TOKEN, payload.firstpayProdBearerToken],
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
 * Get FirstPay API credentials from Secret Manager.
 * Reads the appropriate test/prod credentials based on the mode parameter.
 */
export async function getFirstPaySecrets(mode: 'test' | 'production'): Promise<FirstPaySecretsResult | null> {
  try {
    const isTest = mode === 'test';
    const apiKey = await getSecret(
      isTest ? SECRET_NAMES.FIRSTPAY_TEST_API_KEY : SECRET_NAMES.FIRSTPAY_PROD_API_KEY
    );
    const bearerToken = await getSecret(
      isTest ? SECRET_NAMES.FIRSTPAY_TEST_BEARER_TOKEN : SECRET_NAMES.FIRSTPAY_PROD_BEARER_TOKEN
    );

    if (!apiKey || !bearerToken) return null;

    return { apiKey, bearerToken, mode };
  } catch (error: any) {
    console.error('[getFirstPaySecrets] Error:', error.message);
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
      getSecret(SECRET_NAMES.FIRSTPAY_TEST_API_KEY),
      getSecret(SECRET_NAMES.FIRSTPAY_TEST_BEARER_TOKEN),
      getSecret(SECRET_NAMES.FIRSTPAY_PROD_API_KEY),
      getSecret(SECRET_NAMES.FIRSTPAY_PROD_BEARER_TOKEN),
      getSecret(SECRET_NAMES.GEMINI_API_KEY),
      getSecret(SECRET_NAMES.CHATWORK_API_TOKEN),
      getSecret(SECRET_NAMES.CHATWORK_ROOM_ID),
      getSecret(SECRET_NAMES.GOOGLE_CHAT_WEBHOOK_URL),
    ]);

    return {
      firstpayTestApiKey: !!results[0],
      firstpayTestBearerToken: !!results[1],
      firstpayProdApiKey: !!results[2],
      firstpayProdBearerToken: !!results[3],
      geminiApiKey: !!results[4],
      chatworkApiToken: !!results[5],
      chatworkRoomId: !!results[6],
      googleChatWebhookUrl: !!results[7],
    };
  } catch (error) {
    return {
      firstpayTestApiKey: false,
      firstpayTestBearerToken: false,
      firstpayProdApiKey: false,
      firstpayProdBearerToken: false,
      geminiApiKey: false,
      chatworkApiToken: false,
      chatworkRoomId: false,
      googleChatWebhookUrl: false,
    };
  }
}
