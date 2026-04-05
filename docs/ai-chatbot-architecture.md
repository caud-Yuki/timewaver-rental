# AI Chatbot Architecture

## Overview

The AI support chatbot (`/mypage/support/ai`) uses **Google Genkit** with the **Gemini API** to answer user questions about the TimeWaver rental platform.

## Architecture

```
Client (page.tsx)
  │
  ├─ askChatbot() ──────► Server Action (ai-support-chatbot.ts)
  │                           │
  │                           ├─ getGeminiSecret() → Secret Manager or env var
  │                           ├─ getAiInstance() → Genkit + Google AI plugin
  │                           │
  │                           ├─ Tool: getAvailableDevices → Firestore: devices
  │                           ├─ Tool: checkMyApplicationStatus → Firestore: applications
  │                           │
  │                           └─ ai.generate() → Gemini API
  │
  └─ Display response
```

## Key Files

| File | Purpose |
|---|---|
| `src/app/mypage/support/ai/page.tsx` | Chat UI (client component) |
| `src/ai/flows/ai-support-chatbot.ts` | Server action: `askChatbot()` |
| `src/ai/genkit.ts` | Genkit factory: `createAi(apiKey, model)` |
| `src/ai/models.ts` | Available Gemini model definitions |
| `src/lib/secret-actions.ts` | `getGeminiSecret()` — reads API key |
| `src/lib/secret-manager.ts` | Google Cloud Secret Manager client |

## Gemini API Key Resolution

The API key is resolved in this order:
1. **Google Cloud Secret Manager** — `GEMINI_API_KEY` secret
2. **Environment variable** — `GOOGLE_GENAI_API_KEY` (Genkit standard)
3. **Environment variable** — `GEMINI_API_KEY` (project `.env`)

If none are found, the default Genkit `ai` instance is used (which also needs `GOOGLE_GENAI_API_KEY`).

## Model Configuration

- **Default model**: `googleai/gemini-2.5-flash` (defined in `src/ai/models.ts`)
- **Admin override**: Stored in Firestore `settings/global.geminiModel`
- **Validation**: `resolveModel()` in `genkit.ts` validates the stored model against known models and falls back to default if invalid

### Valid Model Names (Genkit @genkit-ai/google-genai@1.28.0)

```
googleai/gemini-3-pro-preview
googleai/gemini-3-flash-preview
googleai/gemini-2.5-pro
googleai/gemini-2.5-flash
googleai/gemini-2.5-flash-lite
googleai/gemini-2.0-flash
googleai/gemini-2.0-flash-lite
```

**Important**: Model names must match what the Genkit plugin supports. Names like `gemini-3.1-flash` are NOT valid and will cause errors. When upgrading the Genkit plugin, verify model names against the plugin source.

## AI Instance Caching

The Genkit AI instance is cached in module-level variables to avoid:
- Creating a new `genkit()` instance on every chat message
- Re-registration warnings for tools/prompts with the same name

The cache is invalidated when the API key or model changes.

## Tools

### getAvailableDevices
- Queries `devices` collection where `status == 'available'`
- Returns: id, type, typeCode, monthlyPrice, description
- **No auth required** (devices collection is publicly readable)

### checkMyApplicationStatus
- Queries `applications` collection for the user's recent applications
- **Requires auth** — currently wrapped in try/catch because server actions lack auth context
- Returns empty array on permission error (graceful degradation)

## Error Handling

The `askChatbot()` function catches all errors and returns a friendly Japanese error message instead of throwing a 500. Error details are logged server-side with `[AI Chatbot]` prefix for debugging via Cloud Run logs.

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `projectId not provided` | Firebase config missing projectId on server | Add fallback in `firebase/config.ts` |
| `Missing or insufficient permissions` | Server action has no auth, rules block read | Make collection publicly readable or use Admin SDK |
| `Model not found` / API error | Invalid model name in Firestore settings | `resolveModel()` falls back to default |
| `No Gemini API key` | Secret Manager + env vars all empty | Set `GEMINI_API_KEY` in Secret Manager or `.env` |
