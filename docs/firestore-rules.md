# Firestore Security Rules Reference

## Rule Structure

All rules are in `firestore.rules` at the project root. Deploy with:
```bash
firebase deploy --only firestore:rules
```

**Important**: Rules do NOT auto-deploy with App Hosting. They must be deployed manually.

## Verifying what is actually live

`firebase deploy` reports success, but it does not tell you later whether the live ruleset still
matches this file — and several sessions edit this tree at once, so a modified `firestore.rules`
in the working tree is *not* evidence of what production is enforcing. Fetch the live ruleset and
diff it:

```bash
TOKEN=$(gcloud auth print-access-token)
PROJ=studio-3681859885-cd9c1
RS=$(curl -s -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJ" \
  "https://firebaserules.googleapis.com/v1/projects/$PROJ/releases" \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).releases.find(r=>r.name.endsWith('/cloud.firestore')).rulesetName.split('/').pop()")
curl -s -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJ" \
  "https://firebaserules.googleapis.com/v1/projects/$PROJ/rulesets/$RS" \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).source.files[0].content" > /tmp/live.rules
diff /tmp/live.rules firestore.rules && echo "live == local"
```

The `x-goog-user-project` header is required; without it the Rules API returns 403.

For the Next.js app (App Hosting, backend `timewaver-rental`, region `asia-east1`,
`https://timewaver-rental--studio-3681859885-cd9c1.asia-east1.hosted.app`), check which commit is
actually serving before assuming a client-side fix is live:

```bash
firebase apphosting:backends:list --project studio-3681859885-cd9c1
```

To confirm a specific client change shipped, fetch the page and grep its chunk — the chunk
filename hash changes with content, so this is a direct read of what browsers are running:

```bash
BASE=https://timewaver-rental--studio-3681859885-cd9c1.asia-east1.hosted.app
curl -s "$BASE/apply/new" | grep -o '/_next/static/chunks/app/apply/new/page-[a-z0-9]*\.js'
```

## Access Levels

| Level | Meaning | Example |
|---|---|---|
| Public | `allow read: if true` | Anyone, including server actions |
| Authenticated | `allow read: if request.auth != null` | Logged-in users only |
| Owner | `resource.data.userId == request.auth.uid` | Only the document owner |
| Admin | `isAdmin()` | Users with `role == 'admin'` in `users` collection |

## Collection Rules Summary

| Collection | Read | Write | Notes |
|---|---|---|---|
| `users/{userId}` | Auth (owner or admin) | Auth (owner) | |
| `devices/{deviceId}` | **Public** | Admin (create/delete), conditional (update) | Users can lock/release/activate |
| `deviceTypeCodes/*` | **Public** | Admin | |
| `news/*` | **Public** | Admin | |
| `applications/{id}` | Auth (owner or admin) | Auth (owner create), Admin/owner (update) | Server actions CANNOT read |
| `subscriptions/{id}` | Auth (owner or admin) | Auth (owner create), Admin (update) | |
| `supportRequests/{id}` | Auth (owner or admin) | Auth (owner create, `status` must be `'open'`), Admin (update/delete) | 対応状況・`adminNote` は管理者のみ |
| `coupons/*` | **Public** | Admin | |
| `emailTemplates/*` | Admin only | Admin | |
| `emailTriggers/*` | Admin only | Admin | |
| `deviceModules/*` | **Public** | Admin | |
| `modules/*` | **Public** | Admin | |
| `waitlist/*` | Authenticated | Auth (owner create), Admin (update) | |
| `paymentLinks/*` | Auth (owner or admin) | Admin (create/delete), owner (`pending` → `paid` のみ) | 期限切れは更新不可 |
| `settings/global` | **Public** | Admin | Non-sensitive config |
| `consentForm/*` | **Public** | Admin | |

## Server Action Compatibility

Server actions use the client SDK **without authentication**. Only collections with `allow read: if true` can be read by server actions.

Collections accessible from server actions:
- `devices`, `deviceTypeCodes`, `modules`, `deviceModules`
- `news`, `coupons`, `consentForm`
- `settings/global`

Collections NOT accessible from server actions:
- `users`, `applications`, `subscriptions`, `supportRequests`
- `emailTemplates`, `emailTriggers`
- `paymentLinks`（2026-08-21 に公開読み取りを廃止。本人と管理者のみ）

## Field-Level Considerations

### Firestore Field Name Mapping

Some Firestore documents use different field names than the TypeScript types:

| TypeScript Type | Firestore Field | Collection | Notes |
|---|---|---|---|
| `Application.rentalPeriod` | `rentalType` | applications | Number (3, 6, 12), not string ('3m', '6m', '12m') |

Always check Firestore console when adding display logic for existing fields.
