import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { log } from "firebase-functions/logger";

const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  "studio-3681859885-cd9c1";

let client: SecretManagerServiceClient | null = null;
function getClient(): SecretManagerServiceClient {
  if (!client) client = new SecretManagerServiceClient();
  return client;
}

export async function readSecret(name: string): Promise<string | null> {
  try {
    const [version] = await getClient().accessSecretVersion({
      name: `projects/${PROJECT_ID}/secrets/${name}/versions/latest`,
    });
    const data = version.payload?.data;
    if (!data) return null;
    if (typeof data === "string") return data;
    return Buffer.isBuffer(data)
      ? data.toString("utf8")
      : new TextDecoder().decode(data as Uint8Array);
  } catch (err: any) {
    if (err?.code === 5) return null;
    log(`[secrets] read ${name} failed:`, err?.message || err);
    return null;
  }
}
