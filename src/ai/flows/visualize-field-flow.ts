
'use server';
/**
 * @fileOverview A flow that generates an artistic "Quantum Field Visualization" using Imagen 4.
 * Fetches the Gemini API key from Google Cloud Secret Manager.
 */

import {ai, createAi} from '@/ai/genkit';
import {z} from 'genkit';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getGeminiSecret } from '@/lib/secret-actions';

const VisualizeFieldInputSchema = z.object({
  intent: z.string().describe('The user\'s intent or focus for the visualization (e.g., "Health and Vitality", "Business Success").')
});
export type VisualizeFieldInput = z.infer<typeof VisualizeFieldInputSchema>;

const VisualizeFieldOutputSchema = z.object({
  imageUrl: z.string().describe('The data URI of the generated visualization.'),
  interpretation: z.string().describe('A brief, poetic interpretation of the visualization.')
});
export type VisualizeFieldOutput = z.infer<typeof VisualizeFieldOutputSchema>;

async function getAiInstance() {
  const { firestore } = initializeFirebase();
  const settingsSnap = await getDoc(doc(firestore, 'settings', 'global'));
  const geminiModel = settingsSnap.exists() ? settingsSnap.data()?.geminiModel : undefined;

  const apiKey = await getGeminiSecret();
  if (apiKey) {
    return createAi(apiKey, geminiModel);
  }
  return ai;
}

export async function visualizeField(input: VisualizeFieldInput): Promise<VisualizeFieldOutput> {
  const currentAi = await getAiInstance();

  const interpretationPrompt = currentAi.definePrompt({
    name: 'interpretationPrompt',
    input: {schema: VisualizeFieldInputSchema},
    output: {schema: z.object({ text: z.string() })},
    prompt: `You are a visionary interpreter of quantum information fields.
A user has set an intent: "{{{intent}}}".
Provide a brief (1-2 sentences), poetic, and inspiring interpretation of what their unique information field looks like in this moment.
Focus on light, color, and geometric harmony.`
  });

  // Generate the interpretation first
  const { output: interpretationOutput } = await interpretationPrompt(input);
  const interpretation = interpretationOutput?.text || 'Your field resonates with infinite potential.';

  // Generate the image using Imagen 4
  const { media } = await currentAi.generate({
    model: 'googleai/imagen-4.0-fast-generate-001',
    prompt: `An abstract, high-tech, and ethereal digital art piece representing a "Quantum Information Field".
    The visualization is based on the theme: "${input.intent}".
    Use vibrant glowing lines, sacred geometry, flowing energy particles, and a deep, cosmic background.
    Professional medical technology aesthetic, clean, serene, and awe-inspiring.`,
  });

  if (!media) {
    throw new Error('Failed to generate field visualization.');
  }

  return {
    imageUrl: media.url,
    interpretation
  };
}
