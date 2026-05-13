'use server';

/**
 * @fileOverview Server actions for reading/writing secrets via Google Cloud Secret Manager.
 * These actions run on the server and are safe to call from client components.
 */

import { getSecret, setSecret, deleteSecret, googleChatWebhookSecretName, SECRET_NAMES } from '@/lib/secret-manager';

// --- Types ---

export interface SecretPayload {
  stripeTestPublishableKey?: string;
  stripeTestSecretKey?: string;
  stripeLivePublishableKey?: string;
  stripeLiveSecretKey?: string;
  /** @deprecated Use stripeTestWebhookSecret / stripeLiveWebhookSecret instead. Kept for backward compat. */
  stripeWebhookSecret?: string;
  stripeTestWebhookSecret?: string;
  stripeLiveWebhookSecret?: string;
  geminiApiKey?: string;
  chatworkApiToken?: string;
  chatworkRoomId?: string;
  googleChatWebhookUrl?: string;
  gmailOAuthClientId?: string;
  gmailOAuthClientSecret?: string;
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
      [SECRET_NAMES.STRIPE_TEST_WEBHOOK_SECRET, payload.stripeTestWebhookSecret],
      [SECRET_NAMES.STRIPE_LIVE_WEBHOOK_SECRET, payload.stripeLiveWebhookSecret],
      [SECRET_NAMES.STRIPE_WEBHOOK_SECRET, payload.stripeWebhookSecret], // legacy
      [SECRET_NAMES.GEMINI_API_KEY, payload.geminiApiKey],
      [SECRET_NAMES.CHATWORK_API_TOKEN, payload.chatworkApiToken],
      [SECRET_NAMES.CHATWORK_ROOM_ID, payload.chatworkRoomId],
      [SECRET_NAMES.GOOGLE_CHAT_WEBHOOK_URL, payload.googleChatWebhookUrl],
      [SECRET_NAMES.GMAIL_OAUTH_CLIENT_ID, payload.gmailOAuthClientId],
      [SECRET_NAMES.GMAIL_OAUTH_CLIENT_SECRET, payload.gmailOAuthClientSecret],
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
      getSecret(SECRET_NAMES.STRIPE_TEST_WEBHOOK_SECRET),
      getSecret(SECRET_NAMES.STRIPE_LIVE_WEBHOOK_SECRET),
      getSecret(SECRET_NAMES.STRIPE_WEBHOOK_SECRET), // legacy
      getSecret(SECRET_NAMES.GEMINI_API_KEY),
      getSecret(SECRET_NAMES.CHATWORK_API_TOKEN),
      getSecret(SECRET_NAMES.CHATWORK_ROOM_ID),
      getSecret(SECRET_NAMES.GOOGLE_CHAT_WEBHOOK_URL),
      getSecret(SECRET_NAMES.GMAIL_OAUTH_CLIENT_ID),
      getSecret(SECRET_NAMES.GMAIL_OAUTH_CLIENT_SECRET),
    ]);

    return {
      stripeTestPublishableKey: !!results[0],
      stripeTestSecretKey: !!results[1],
      stripeLivePublishableKey: !!results[2],
      stripeLiveSecretKey: !!results[3],
      stripeTestWebhookSecret: !!results[4],
      stripeLiveWebhookSecret: !!results[5],
      stripeWebhookSecret: !!results[6], // legacy
      geminiApiKey: !!results[7],
      chatworkApiToken: !!results[8],
      chatworkRoomId: !!results[9],
      googleChatWebhookUrl: !!results[10],
      gmailOAuthClientId: !!results[11],
      gmailOAuthClientSecret: !!results[12],
    };
  } catch (error) {
    return {
      stripeTestPublishableKey: false,
      stripeTestSecretKey: false,
      stripeLivePublishableKey: false,
      stripeLiveSecretKey: false,
      stripeTestWebhookSecret: false,
      stripeLiveWebhookSecret: false,
      stripeWebhookSecret: false,
      geminiApiKey: false,
      chatworkApiToken: false,
      chatworkRoomId: false,
      googleChatWebhookUrl: false,
      gmailOAuthClientId: false,
      gmailOAuthClientSecret: false,
    };
  }
}

// --- Google Chat Destinations (multi-destination) ---

/**
 * Save a Google Chat destination's webhook URL to Secret Manager.
 * Returns { success, error } so the caller can surface failure to the user.
 */
export async function saveGoogleChatDestinationUrl(
  destinationId: string,
  webhookUrl: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!destinationId || !destinationId.match(/^[a-zA-Z0-9_-]{1,40}$/)) {
      return { success: false, error: 'Invalid destination id.' };
    }
    if (!webhookUrl || !webhookUrl.startsWith('https://chat.googleapis.com/')) {
      return { success: false, error: '正しい Google Chat Webhook URL を入力してください。' };
    }
    await setSecret(googleChatWebhookSecretName(destinationId), webhookUrl.trim());
    return { success: true };
  } catch (error: any) {
    console.error('[saveGoogleChatDestinationUrl] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a destination's webhook URL from Secret Manager. Idempotent — calling
 * on an unknown destinationId still resolves successfully.
 */
export async function deleteGoogleChatDestinationUrl(
  destinationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await deleteSecret(googleChatWebhookSecretName(destinationId));
    return { success: true };
  } catch (error: any) {
    console.error('[deleteGoogleChatDestinationUrl] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send a test message to a Google Chat destination. The caller can pass an
 * explicit `webhookUrl` to test before saving, or omit it to use the URL
 * stored for `destinationId`. Returns plain status (no leaked details).
 */
export async function testGoogleChatDestination(args: {
  destinationId?: string;
  webhookUrl?: string;
  message?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    let url = args.webhookUrl?.trim() || '';
    if (!url && args.destinationId) {
      const stored = await getSecret(googleChatWebhookSecretName(args.destinationId));
      if (!stored) return { success: false, error: 'この通知先は URL が未設定です。' };
      url = stored;
    }
    if (!url || !url.startsWith('https://chat.googleapis.com/')) {
      return { success: false, error: 'Google Chat の Webhook URL が見つかりません。' };
    }

    const text = args.message?.trim() || '✅ TimeWaverHub からのテスト送信です。この宛先で通知が受け取れます。';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { success: false, error: `Google Chat returned ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { success: true };
  } catch (error: any) {
    console.error('[testGoogleChatDestination] Error:', error.message);
    return { success: false, error: error.message };
  }
}
