import { KeyManagementServiceClient } from "@google-cloud/kms";
import { log } from "firebase-functions/logger";

const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  "studio-3681859885-cd9c1";
const LOCATION = process.env.MAIL_KMS_LOCATION || "us-central1";
const KEYRING = process.env.MAIL_KMS_KEYRING || "gmail-tokens";
const KEY = process.env.MAIL_KMS_KEY || "gmail-token-encryption";

let client: KeyManagementServiceClient | null = null;
function getClient(): KeyManagementServiceClient {
  if (!client) client = new KeyManagementServiceClient();
  return client;
}

function keyName(): string {
  return `projects/${PROJECT_ID}/locations/${LOCATION}/keyRings/${KEYRING}/cryptoKeys/${KEY}`;
}

export interface EncryptedString {
  ciphertext: string;
  kmsKeyVersion: string;
}

export async function encryptString(plaintext: string): Promise<EncryptedString> {
  const c = getClient();
  const [resp] = await c.encrypt({
    name: keyName(),
    plaintext: Buffer.from(plaintext, "utf8"),
  });
  if (!resp.ciphertext) throw new Error("KMS encrypt returned empty ciphertext");
  const ciphertext =
    typeof resp.ciphertext === "string"
      ? resp.ciphertext
      : Buffer.from(resp.ciphertext).toString("base64");
  return {
    ciphertext,
    kmsKeyVersion: resp.name || keyName(),
  };
}

export async function decryptString(ciphertextB64: string): Promise<string> {
  const c = getClient();
  try {
    const [resp] = await c.decrypt({
      name: keyName(),
      ciphertext: Buffer.from(ciphertextB64, "base64"),
    });
    if (!resp.plaintext) throw new Error("KMS decrypt returned empty plaintext");
    return Buffer.isBuffer(resp.plaintext)
      ? resp.plaintext.toString("utf8")
      : Buffer.from(resp.plaintext).toString("utf8");
  } catch (err: any) {
    log("[KMS] decrypt failed:", err?.message || err);
    throw new Error(`KMS decrypt failed: ${err?.message || "unknown"}`);
  }
}
