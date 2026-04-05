# Firestore Security Rules Reference

## Rule Structure

All rules are in `firestore.rules` at the project root. Deploy with:
```bash
firebase deploy --only firestore:rules
```

**Important**: Rules do NOT auto-deploy with App Hosting. They must be deployed manually.

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
| `supportRequests/{id}` | Auth (owner or admin) | Auth (owner create), Admin (update) | |
| `coupons/*` | **Public** | Admin | |
| `emailTemplates/*` | Admin only | Admin | |
| `emailTriggers/*` | Admin only | Admin | |
| `deviceModules/*` | **Public** | Admin | |
| `modules/*` | **Public** | Admin | |
| `waitlist/*` | Authenticated | Auth (owner create), Admin (update) | |
| `paymentLinks/*` | **Public** | Admin (create/delete), conditional (update) | |
| `settings/global` | **Public** | Admin | Non-sensitive config |
| `consentForm/*` | **Public** | Admin | |

## Server Action Compatibility

Server actions use the client SDK **without authentication**. Only collections with `allow read: if true` can be read by server actions.

Collections accessible from server actions:
- `devices`, `deviceTypeCodes`, `modules`, `deviceModules`
- `news`, `coupons`, `paymentLinks`, `consentForm`
- `settings/global`

Collections NOT accessible from server actions:
- `users`, `applications`, `subscriptions`, `supportRequests`
- `emailTemplates`, `emailTriggers`

## Field-Level Considerations

### Firestore Field Name Mapping

Some Firestore documents use different field names than the TypeScript types:

| TypeScript Type | Firestore Field | Collection | Notes |
|---|---|---|---|
| `Application.rentalPeriod` | `rentalType` | applications | Number (3, 6, 12), not string ('3m', '6m', '12m') |

Always check Firestore console when adding display logic for existing fields.
