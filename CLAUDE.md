# CLAUDE.md — Project Guide for AI Assistants

## Project Overview

- **Name**: TWRENTAL-PLATFORM (ChronoRent / TimeWaver Rental)
- **Stack**: Next.js 15 (App Router) + TypeScript + Firebase (Firestore, Functions, Storage, App Hosting)
- **UI**: shadcn/ui + Tailwind CSS + Lucide icons
- **Repo**: `https://github.com/caud-Yuki/timewaver-rental.git` (branch: `main`)
- **Firebase Project**: `studio-3681859885-cd9c1`
- **Live URL**: `https://timewaver-rental--studio-3681859885-cd9c1-cd9c1.asia-east1.hosted.app`

---

## Directory Structure

```
TWRENTAL-PLATFORM_vrs.1.0/
├── src/                    # Next.js frontend
│   ├── app/                # App Router pages
│   │   ├── admin/          # Admin pages (applications, devices, subscriptions, settings)
│   │   ├── auth/           # Login/register
│   │   ├── devices/        # Device catalog
│   │   └── mypage/         # User dashboard
│   ├── components/         # Shared components (ui/ for shadcn)
│   ├── firebase/           # Firebase client hooks (useUser, useFirestore, useCollection, useDoc)
│   ├── hooks/              # Custom hooks
│   ├── lib/                # Utility functions
│   └── types/              # TypeScript types + Firestore converters
├── functions/              # Firebase Cloud Functions (TypeScript)
│   └── src/
│       ├── index.ts        # All callable + trigger functions
│       ├── gmail.ts        # Gmail API integration (sendMail)
│       └── triggers.ts     # Firestore trigger email logic
├── firebase.json           # Firebase service config
├── apphosting.yaml         # App Hosting config
└── .firebaserc             # Firebase project alias
```

---

## Deployment Guide (Step by Step)

### Prerequisites

- Git is configured and authenticated for `https://github.com/caud-Yuki/timewaver-rental.git`
- Firebase CLI is installed and logged in (`firebase login`)
- Node.js and npm are installed

### Step 1: Frontend Deployment (App Hosting — automatic via git push)

The frontend is deployed via **Firebase App Hosting**, which auto-builds and deploys on every push to `main`.

```bash
cd "/Users/yukiteraoka/Desktop/WORKING PROGRESS/04_カウデザイン/Apps/TWRENTAL-PLATFORM/TWRENTAL-PLATFORM_vrs.1.0"

# 1. Stage changed files (be specific — never use `git add -A`)
git add src/app/admin/applications/page.tsx src/components/SomeComponent.tsx

# 2. Commit with descriptive message
git commit -m "Add feature X to admin panel

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

# 3. Push to main — this triggers automatic App Hosting build & deploy
git push origin main
```

After push, App Hosting builds and deploys automatically (takes 2-5 minutes).

### Step 2: Cloud Functions Deployment (manual via Firebase CLI)

Cloud Functions are NOT auto-deployed. They must be deployed manually:

```bash
cd "/Users/yukiteraoka/Desktop/WORKING PROGRESS/04_カウデザイン/Apps/TWRENTAL-PLATFORM/TWRENTAL-PLATFORM_vrs.1.0"

# IMPORTANT: Always clean-build TypeScript before deploying!
cd functions && rm -rf lib/ && npx tsc && cd ..

# Deploy all functions
firebase deploy --only functions

# Or deploy a specific function
firebase deploy --only functions:sendAdHocEmail
```

**Critical**: If you skip the TypeScript rebuild (`rm -rf lib/ && npx tsc`), the deploy may use stale cached JS and new/changed functions won't be detected.

#### Instructions for AI assistants (Claude)

When the user asks you to deploy Cloud Functions, you are **authorized to run the following commands directly** without asking for additional confirmation:

```bash
# Step 1 — always rebuild TypeScript first (catches type errors before deploy)
cd "/Users/yukiteraoka/Desktop/WORKING PROGRESS/04_カウデザイン/Apps/TWRENTAL-PLATFORM/TWRENTAL-PLATFORM_vrs.1.0/functions" && rm -rf lib/ && npx tsc

# Step 2 — if tsc exits with zero errors, deploy
cd "/Users/yukiteraoka/Desktop/WORKING PROGRESS/04_カウデザイン/Apps/TWRENTAL-PLATFORM/TWRENTAL-PLATFORM_vrs.1.0" && firebase deploy --only functions
```

Rules:
- **Always run `rm -rf lib/ && npx tsc` before deploying.** If tsc reports errors, stop and report them to the user instead of deploying.
- If `functions/src/` files were edited in the same session, the rebuild is already done — confirm and proceed to deploy.
- After a successful deploy, report which functions were updated (from the CLI output).
- Do NOT skip the rebuild step even if asked to "just deploy quickly".

### Step 3: Firestore Rules / Storage Rules (if changed)

```bash
# Deploy Firestore security rules
firebase deploy --only firestore:rules

# Deploy Storage security rules
firebase deploy --only storage
```

### Step 4: Verify Deployment

```bash
# Check deployed functions
firebase functions:list

# Check App Hosting build status
firebase apphosting:backends:list --project studio-3681859885-cd9c1
```

---

## Common Deployment Scenarios

### Frontend-only change (UI, pages, components)
```bash
git add <changed files>
git commit -m "description"
git push origin main
# Done — App Hosting auto-deploys
```

### Cloud Function change (functions/src/)
```bash
# 1. Push code to git
git add functions/src/index.ts
git commit -m "description"
git push origin main

# 2. Deploy functions separately
cd functions && rm -rf lib/ && npx tsc && cd ..
firebase deploy --only functions
```

### Both frontend + functions changed
```bash
# 1. Push to git (triggers frontend deploy)
git add <all changed files>
git commit -m "description"
git push origin main

# 2. Deploy functions manually
cd functions && rm -rf lib/ && npx tsc && cd ..
firebase deploy --only functions
```

---

## Important Rules

1. **Never commit secrets**: `serviceAccountKey.json`, `.env*` files, API keys — GitHub will block the push
2. **Always rebuild functions TypeScript** before deploying: `cd functions && rm -rf lib/ && npx tsc && cd ..`
3. **Stage files individually** — avoid `git add -A` or `git add .` to prevent accidentally committing secrets
4. **Branch**: Always work on `main` (single-branch workflow)
5. **Co-author tag**: Include `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>` in commits

---

## Account Information

### GitHub
- **Account**: `caud-Yuki`
- **Repository**: `timewaver-rental`
- **Auth**: Git credential is already stored on this machine (no manual login needed)

### Firebase
- **Project ID**: `studio-3681859885-cd9c1`
- **Auth**: Firebase CLI is already authenticated on this machine via `firebase login`
- **Region**: Functions deploy to `us-central1`, App Hosting to `asia-east1`

> **Note**: Passwords and tokens are NOT stored in this file for security reasons.
> Git and Firebase CLI sessions persist on this machine — no manual login is required for deployment.

---

## Development (Local)

```bash
cd "/Users/yukiteraoka/Desktop/WORKING PROGRESS/04_カウデザイン/Apps/TWRENTAL-PLATFORM/TWRENTAL-PLATFORM_vrs.1.0"

# Start Next.js dev server (runs on port 9003, not default 3000)
npm run dev

# Functions emulator (optional)
firebase emulators:start --only functions
```

---

## Code Patterns & Conventions

### Firebase Hooks (src/firebase/)

All data fetching uses custom hooks — never call Firestore directly in components:

```tsx
import { useUser, useFirestore, useCollection, useDoc } from '@/firebase';

// Auth
const { user, loading } = useUser();

// Firestore instance
const db = useFirestore();

// Collection with real-time updates (always use converters)
const q = useMemo(() =>
  query(collection(db, 'applications'), orderBy('createdAt', 'desc')).withConverter(applicationConverter),
[db]);
const { data: applications, loading } = useCollection<Application>(q);

// Single document
const ref = useMemo(() =>
  doc(db, 'users', userId).withConverter(userProfileConverter),
[db, userId]);
const { data: profile } = useDoc<UserProfile>(ref);
```

### Type System & Firestore Converters (src/types/)

Every Firestore collection needs a **type** and a **converter**. The converter factory is in `src/types.ts`:

```tsx
// Adding a new collection type:
// 1. Define the interface in src/types/index.ts
export interface MyNewType {
  id: string;
  name: string;
  createdAt?: Timestamp;
}

// 2. Create converter using the factory
export const myNewTypeConverter = createConverter<MyNewType>();
```

### Key Firestore Collections

| Collection | Type | Converter | Purpose |
|---|---|---|---|
| `users` | `UserProfile` | `userProfileConverter` | User accounts & roles |
| `applications` | `Application` | `applicationConverter` | Rental applications |
| `devices` | `Device` | `deviceConverter` | Device inventory |
| `deviceTypeCodes` | `DeviceTypeCode` | `deviceTypeCodeConverter` | Device type definitions |
| `modules` | `DeviceModule` | `moduleConverter` | Add-on modules |
| `waitlist` | `Waitlist` | `waitlistConverter` | Waitlist entries |
| `emailTemplates` | `EmailTemplate` | `emailTemplateConverter` | Email HTML templates |
| `emailTriggers` | — | — | Trigger → template mappings |
| `news` | — | — | News/announcements |
| `settings` | `GlobalSettings` | — | Single doc: `settings/global` |

### Application Status Flow

```
pending → awaiting_consent_form → consent_form_review → consent_form_approved
  ↓              ↓
rejected      canceled

consent_form_approved → payment_sent → completed → shipped → in_use

in_use → expired → returning → inspection → returned → closed
                                    ↓
                                 damaged
```

### Cloud Functions Pattern (functions/src/index.ts)

```tsx
// Callable function (called from frontend via httpsCallable)
export const myFunction = onCall(async (request) => {
  const { param1, param2 } = request.data;
  if (!param1) throw new HttpsError("invalid-argument", "param1 is required.");

  try {
    // ... logic ...
    return { success: true, data: result };
  } catch (error: any) {
    throw new HttpsError("internal", error.message);
  }
});

// Calling from frontend:
const functions = getFunctions();
const myFn = httpsCallable(functions, 'myFunction');
const result = await myFn({ param1: 'value' });
```

### Email System

- **Templates**: Stored in `emailTemplates` collection with `subject`, `body` (HTML), placeholders like `{{userName}}`
- **Triggers**: `emailTriggers` collection maps events to template IDs
- **Sending**: `sendMail()` in `functions/src/gmail.ts` via Gmail API (service account)
- **Ad-hoc**: `sendAdHocEmail` Cloud Function for admin-composed emails
- **Design**: Email wrapper (header color, font, footer) read from `settings/global.emailDesign`

### Secrets Management

Sensitive values (API keys, tokens) are stored in **Google Cloud Secret Manager**, NOT in `.env` files:

```tsx
// Server-side only (src/lib/secret-manager.ts)
import { getSecret, setSecret } from '@/lib/secret-manager';
const apiKey = await getSecret('STRIPE_LIVE_SECRET_KEY');
```

Known secrets: `STRIPE_TEST_SECRET_KEY`, `STRIPE_LIVE_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `STRIPE_LIVE_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `CHATWORK_API_TOKEN`, `CHATWORK_ROOM_ID`, `GOOGLE_CHAT_WEBHOOK_URL`

### Admin Page Pattern

All admin pages follow this structure:

```tsx
'use client';
export default function AdminSomethingPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  // Auth guard — redirect non-admin
  useEffect(() => {
    if (!authLoading && adminProfile?.role !== 'admin') router.push('/');
  }, []);

  // Data fetching with converters
  const query = useMemo(() => /* ... */, [db]);
  const { data, loading } = useCollection<Type>(query);

  // CRUD operations use updateDoc/addDoc + serverTimestamp()
  // Show results with toast()
}
```

### Custom Components

- **RichTextEditor** (`src/components/ui/rich-text-editor.tsx`): Wraps `react-quill` with SSR disabled via dynamic import. Used for email templates and news editing.
- **Toast**: Custom reducer-based implementation in `src/hooks/use-toast.ts` (not shadcn default)

---

## Gotchas & Known Issues

1. **Functions TypeScript cache**: Always `rm -rf lib/ && npx tsc` before deploying — stale JS causes silent failures
2. **GitHub push protection**: Never commit `serviceAccountKey.json` or `.env*` — push will be rejected
3. **Dev server port**: Runs on `9003`, not default `3000`
4. **Firestore converters**: Always use `.withConverter()` on queries — without it, types won't match
5. **SSR + Firebase**: Firebase hooks only work client-side. Pages using them must have `'use client'` directive
6. **Email HTML**: `sendMail()` wraps body in HTML template. If body already contains HTML tags, it's inserted as-is; plain text gets `\n` → `<br>` conversion
