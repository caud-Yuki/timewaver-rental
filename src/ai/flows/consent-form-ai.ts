'use server';

import { ai, createAi } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getGeminiSecret } from '@/lib/secret-actions';

async function getAiInstance() {
  const { firestore } = initializeFirebase();
  const settingsSnap = await getDoc(doc(firestore, 'settings', 'global'));
  const geminiModel = settingsSnap.exists() ? settingsSnap.data()?.geminiModel : undefined;
  const apiKey = await getGeminiSecret();
  if (apiKey) return createAi(apiKey, geminiModel);
  return ai;
}

// ---------------------------------------------------------------------------
// Optimize an existing section
// ---------------------------------------------------------------------------
const OptimizeSectionInputSchema = z.object({
  sectionTitle: z.string(),
  sectionType: z.string(),
  currentContent: z.string().describe('Plain text for paragraph, JSON-stringified array for list types'),
  userPrompt: z.string().describe('Admin instructions for the optimisation'),
  serviceName: z.string().optional(),
});
export type OptimizeSectionInput = z.infer<typeof OptimizeSectionInputSchema>;

const SuggestionSchema = z.object({
  summary: z.string().describe('One-line summary of what changed'),
  content: z.string().describe(
    'New content — plain text for paragraph; JSON-stringified string array for list types'
  ),
});

const OptimizeSectionOutputSchema = z.object({
  suggestions: z.array(SuggestionSchema),
});
export type OptimizeSectionOutput = z.infer<typeof OptimizeSectionOutputSchema>;

export async function optimizeConsentSection(
  input: OptimizeSectionInput
): Promise<OptimizeSectionOutput> {
  const currentAi = await getAiInstance();
  const serviceName = input.serviceName || 'サービス';

  const optimizePrompt = currentAi.definePrompt({
    name: 'optimizeConsentSectionPrompt',
    input: { schema: OptimizeSectionInputSchema },
    output: { schema: OptimizeSectionOutputSchema },
    prompt: `You are a Japanese legal document specialist who optimises B2C rental consent form sections.

Service name: ${serviceName}
Section title: "{{sectionTitle}}"
Section type: {{sectionType}}
Current content: {{currentContent}}
Admin instructions: "{{userPrompt}}"

Return exactly 3 suggestions. Each must:
- Be in polished Japanese suitable for a B2C rental contract
- Preserve the same type: paragraph → plain text; terms_list / consent_items → JSON string array (e.g. '["item1","item2"]')
- Include a brief one-line summary of the approach taken
- Be distinctly different from each other in tone, depth, or emphasis`,
  });

  const { output } = await optimizePrompt(input);
  return output ?? { suggestions: [] };
}

// ---------------------------------------------------------------------------
// Optimize a single item within a section
// ---------------------------------------------------------------------------
const OptimizeItemInputSchema = z.object({
  sectionTitle: z.string(),
  itemText: z.string().describe('The specific item/clause to optimise'),
  siblingItems: z.array(z.string()).describe('All other items in the section for context'),
  userPrompt: z.string().describe('Admin instructions'),
  serviceName: z.string().optional(),
});
export type OptimizeItemInput = z.infer<typeof OptimizeItemInputSchema>;

const OptimizeItemOutputSchema = z.object({
  suggestions: z.array(z.object({
    summary: z.string(),
    text: z.string().describe('The replacement text for this single item'),
  })),
});
export type OptimizeItemOutput = z.infer<typeof OptimizeItemOutputSchema>;

export async function optimizeConsentItem(
  input: OptimizeItemInput
): Promise<OptimizeItemOutput> {
  const currentAi = await getAiInstance();
  const serviceName = input.serviceName || 'サービス';

  const optimizeItemPrompt = currentAi.definePrompt({
    name: 'optimizeConsentItemPrompt',
    input: { schema: OptimizeItemInputSchema },
    output: { schema: OptimizeItemOutputSchema },
    prompt: `You are a Japanese legal document specialist optimising a single clause in a B2C rental consent form.

Service name: ${serviceName}
Section: "{{sectionTitle}}"
Target clause: "{{itemText}}"
Other clauses in this section (for context): {{siblingItems}}
Admin instructions: "{{userPrompt}}"

Return exactly 3 rewritten versions of the target clause only.
Each must:
- Be in polished Japanese for a B2C rental contract
- Remain consistent in style with the other clauses
- Be a complete, standalone clause (not a fragment)
- Include a brief one-line summary of the approach
- Be meaningfully different from each other`,
  });

  const { output } = await optimizeItemPrompt(input);
  return output ?? { suggestions: [] };
}

// ---------------------------------------------------------------------------
// Generate a brand-new section
// ---------------------------------------------------------------------------
const GenerateSectionInputSchema = z.object({
  prompt: z.string().describe('What the new section should cover'),
  existingSectionTitles: z.array(z.string()),
  serviceName: z.string().optional(),
});
export type GenerateSectionInput = z.infer<typeof GenerateSectionInputSchema>;

const GenerateSectionOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string().describe('Section title in Japanese'),
      type: z
        .enum(['paragraph', 'terms_list', 'consent_items'])
        .describe('Best matching section type'),
      content: z.string().describe(
        'Plain text for paragraph; JSON-stringified array for list types'
      ),
      summary: z.string().describe('One-line description of this section'),
    })
  ),
});
export type GenerateSectionOutput = z.infer<typeof GenerateSectionOutputSchema>;

export async function generateConsentSection(
  input: GenerateSectionInput
): Promise<GenerateSectionOutput> {
  const currentAi = await getAiInstance();
  const serviceName = input.serviceName || 'サービス';

  const generatePrompt = currentAi.definePrompt({
    name: 'generateConsentSectionPrompt',
    input: { schema: GenerateSectionInputSchema },
    output: { schema: GenerateSectionOutputSchema },
    prompt: `You are a Japanese legal document specialist creating new sections for a B2C equipment rental consent form.

Service name: ${serviceName}
Existing sections: {{existingSectionTitles}}
Admin request: "{{prompt}}"

Generate exactly 3 distinct suggestions. Each must:
- Be in polished Japanese for a B2C rental contract
- Choose the most appropriate type: paragraph (free prose), terms_list (numbered legal clauses), or consent_items (checkbox acknowledgements)
- For list types: content must be a JSON-stringified string array
- Include a concise one-line summary
- Be meaningfully different from the others`,
  });

  const { output } = await generatePrompt(input);
  return output ?? { suggestions: [] };
}
