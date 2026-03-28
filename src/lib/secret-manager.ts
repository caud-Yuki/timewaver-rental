/**
 * @fileOverview Google Cloud Secret Manager utility for reading and writing secrets.
 * Server-side only — do not import from client components.
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-3681859885-cd9c1';

let client: SecretManagerServiceClient | null = null;

function getClient(): SecretManagerServiceClient {
  if (!client) {
    client = new SecretManagerServiceClient();
  }
  return client;
}

/**
 * Read the latest version of a secret from Google Cloud Secret Manager.
 * Returns null if the secret does not exist.
 */
export async function getSecret(secretName: string): Promise<string | null> {
  try {
    const smClient = getClient();
    const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;
    const [version] = await smClient.accessSecretVersion({ name });
    const payload = version.payload?.data;

    if (!payload) return null;

    if (typeof payload === 'string') return payload;
    if (payload instanceof Uint8Array) return new TextDecoder().decode(payload);
    return payload.toString();
  } catch (error: any) {
    // Secret not found (NOT_FOUND) is expected for first-time setup
    if (error?.code === 5) {
      return null;
    }
    console.error(`[SecretManager] Failed to read secret "${secretName}":`, error.message);
    return null;
  }
}

/**
 * Create or update a secret in Google Cloud Secret Manager.
 * If the secret doesn't exist, it creates it first, then adds a version.
 */
export async function setSecret(secretName: string, value: string): Promise<void> {
  const smClient = getClient();
  const parent = `projects/${PROJECT_ID}`;
  const secretPath = `${parent}/secrets/${secretName}`;

  // Try to create the secret (ignore if already exists)
  try {
    await smClient.createSecret({
      parent,
      secretId: secretName,
      secret: {
        replication: {
          automatic: {},
        },
      },
    });
  } catch (error: any) {
    // ALREADY_EXISTS (code 6) is fine — secret already created
    if (error?.code !== 6) {
      throw error;
    }
  }

  // Add a new version with the secret value
  await smClient.addSecretVersion({
    parent: secretPath,
    payload: {
      data: Buffer.from(value, 'utf8'),
    },
  });
}

/**
 * Secret name constants used throughout the application.
 */
export const SECRET_NAMES = {
  FIRSTPAY_TEST_API_KEY: 'FIRSTPAY_TEST_API_KEY',
  FIRSTPAY_TEST_BEARER_TOKEN: 'FIRSTPAY_TEST_BEARER_TOKEN',
  FIRSTPAY_PROD_API_KEY: 'FIRSTPAY_PROD_API_KEY',
  FIRSTPAY_PROD_BEARER_TOKEN: 'FIRSTPAY_PROD_BEARER_TOKEN',
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  CHATWORK_API_TOKEN: 'CHATWORK_API_TOKEN',
  CHATWORK_ROOM_ID: 'CHATWORK_ROOM_ID',
  GOOGLE_CHAT_WEBHOOK_URL: 'GOOGLE_CHAT_WEBHOOK_URL',
} as const;
