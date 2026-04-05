# Server Actions & Firebase SDK — Architecture Guide

## Overview

This project uses **Next.js Server Actions** (`'use server'`) for server-side logic. A critical architectural constraint is that server actions use the **client-side Firebase SDK** (`firebase/firestore`), NOT `firebase-admin`.

## Why This Matters

| Context | SDK | Auth | Firestore Rules |
|---|---|---|---|
| Client components | `firebase/firestore` | User's auth token | Enforced |
| Server actions | `firebase/firestore` | **No auth token** | Enforced (unauthenticated) |
| Cloud Functions | `firebase-admin` | Service account | **Bypassed** |

Server actions run on the server but use the client SDK, which means:
- They have **no `request.auth`** context
- Firestore security rules treat them as **unauthenticated requests**
- Any rule requiring `request.auth != null` will **block** server action reads/writes

## Firestore Rules Implications

When writing Firestore rules, consider which collections are accessed by server actions:

```
// Server actions CAN read (rules allow unauthenticated):
settings/global     → allow read: if true
devices/*           → allow read: if true
deviceTypeCodes/*   → allow read: if true
news/*              → allow read: if true

// Server actions CANNOT read (rules require auth):
applications/*      → allow read: if request.auth != null && ...
users/*             → allow read: if request.auth != null && ...
```

## Server Actions in This Project

| File | Function | Firestore Access |
|---|---|---|
| `src/ai/flows/ai-support-chatbot.ts` | `askChatbot()` | Reads `settings/global`, `devices`, `applications` |
| `src/lib/secret-actions.ts` | `getGeminiSecret()` etc. | Uses Secret Manager (not Firestore) |

## Common Pitfalls

### 1. "projectId not provided" Error
The Firebase config (`src/firebase/config.ts`) reads `NEXT_PUBLIC_FIREBASE_PROJECT_ID` from env vars. On App Hosting, `NEXT_PUBLIC_*` vars are inlined at build time but may not be available at runtime. Always include a hardcoded fallback for `projectId`:
```ts
projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-3681859885-cd9c1',
```

### 2. "Missing or insufficient permissions" Error
Server actions using the client SDK have no auth context. If a server action needs to read a Firestore collection, the security rules must allow unauthenticated reads (`if true`) for that collection, OR the project must add `firebase-admin` for server-side reads.

### 3. `'use client'` on Config Files
Do NOT put `'use client'` on shared config files (like `firebase/config.ts`). It prevents proper usage in server action contexts. Only React components and hooks need `'use client'`.

## Future Consideration: Firebase Admin SDK

To properly handle authenticated server-side reads (e.g., querying a user's applications), consider adding `firebase-admin` as a dependency. This would allow server actions to bypass Firestore rules using service account credentials, matching the Cloud Functions pattern.
