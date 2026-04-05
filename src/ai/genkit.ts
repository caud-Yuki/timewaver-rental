import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';
import { DEFAULT_GEMINI_MODEL, AVAILABLE_GEMINI_MODELS } from './models';

// Re-export for convenience
export { DEFAULT_GEMINI_MODEL, AVAILABLE_GEMINI_MODELS } from './models';

// Validate that a model string is one of our known models
function resolveModel(model?: string): string {
  if (!model) return DEFAULT_GEMINI_MODEL;
  const valid = AVAILABLE_GEMINI_MODELS.some(m => m.value === model);
  if (!valid) {
    console.warn(`[Genkit] Unknown model "${model}", falling back to ${DEFAULT_GEMINI_MODEL}`);
    return DEFAULT_GEMINI_MODEL;
  }
  return model;
}

// Default instance (uses env var GOOGLE_GENAI_API_KEY as fallback)
export const ai = genkit({
  plugins: [googleAI()],
  model: DEFAULT_GEMINI_MODEL,
});

// Factory function to create an AI instance with a specific API key and model
export function createAi(apiKey: string, model?: string) {
  return genkit({
    plugins: [googleAI({ apiKey })],
    model: resolveModel(model),
  });
}
