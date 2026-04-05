/**
 * Available Gemini models for the AI settings dropdown.
 * This file is safe to import from both client and server components.
 */

export const DEFAULT_GEMINI_MODEL = 'googleai/gemini-2.5-flash';

export const AVAILABLE_GEMINI_MODELS = [
  { value: 'googleai/gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)' },
  { value: 'googleai/gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
  { value: 'googleai/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'googleai/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'googleai/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { value: 'googleai/gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'googleai/gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
] as const;
