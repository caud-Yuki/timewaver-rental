/**
 * @fileOverview Firebase Admin SDK singleton for the Next.js server runtime.
 *
 * SERVER-ONLY. Never import this from a client component, and never re-export
 * anything from it through a `'use server'` file — doing so would turn these
 * privileged helpers into public RPC endpoints.
 *
 * Credentials come from Application Default Credentials: on Firebase App
 * Hosting / Cloud Run the backend service account is picked up automatically.
 * For local development set GOOGLE_APPLICATION_CREDENTIALS, which is the same
 * requirement the app already has for @google-cloud/secret-manager.
 */

import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-3681859885-cd9c1';

/**
 * Named app so we never collide with a default app initialised elsewhere
 * (Genkit's Firebase plugin pulls in firebase-admin as well).
 */
const ADMIN_APP_NAME = 'twrental-next-admin';

function adminApp(): App {
  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME);
  if (existing) return existing;
  // Credential is resolved lazily from ADC on first use.
  return initializeApp({ projectId: PROJECT_ID }, ADMIN_APP_NAME);
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

export function adminFirestore(): Firestore {
  return getFirestore(adminApp());
}
