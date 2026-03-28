/**
 * Available Gemini models for the AI settings dropdown.
 * This file is safe to import from both client and server components.
 */

export const DEFAULT_GEMINI_MODEL = 'googleai/gemini-3.1-flash';

export const AVAILABLE_GEMINI_MODELS = [
  { value: 'googleai/gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
  { value: 'googleai/gemini-3.1-flash', label: 'Gemini 3.1 Flash' },
  { value: 'googleai/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { value: 'googleai/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'googleai/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'googleai/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
] as const;
