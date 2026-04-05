
'use server';
/**
 * @fileOverview An AI support chatbot for the TimeWaver rental platform.
 *
 * - askChatbot - A function that handles user queries for the AI chatbot.
 * - Fetches the Gemini API key from Google Cloud Secret Manager.
 *
 * Architecture note: Server actions use the client Firebase SDK without auth
 * context, so collections requiring authentication (applications, users) cannot
 * be queried here. User-specific data must be passed from the client.
 */

import {ai, createAi} from '@/ai/genkit';
import {z} from 'genkit';
import { initializeFirebase } from '@/firebase';
import { collection, getDocs, doc, getDoc, query, where, limit } from 'firebase/firestore';
import { getGeminiSecret } from '@/lib/secret-actions';

const ChatbotInputSchema = z.object({
  query: z.string().describe('The user\'s question about the TimeWaver rental platform.'),
  userId: z.string().optional().describe('The ID of the currently logged-in user.'),
  serviceName: z.string().optional().describe('The service/platform name to use in responses.'),
  userApplications: z.array(z.object({
    deviceType: z.string(),
    status: z.string(),
    createdAt: z.string(),
  })).optional().describe('The user\'s recent applications, fetched client-side.'),
});
export type ChatbotInput = z.infer<typeof ChatbotInputSchema>;

const ChatbotOutputSchema = z.object({
  answer: z.string().describe('The AI\'s answer to the user\'s question.')
});
export type ChatbotOutput = z.infer<typeof ChatbotOutputSchema>;

// Cache the AI instance and tools to avoid re-creation and re-registration
let cachedAi: ReturnType<typeof createAi> | null = null;
let cachedApiKey: string | null = null;
let cachedModel: string | undefined = undefined;
let cachedTools: any[] | null = null;

/**
 * Returns the appropriate AI instance — using the Secret Manager key and
 * the admin-selected model from Firestore settings.
 */
async function getAiInstance() {
  const { firestore } = initializeFirebase();
  const settingsSnap = await getDoc(doc(firestore, 'settings', 'global'));
  const geminiModel = settingsSnap.exists() ? settingsSnap.data()?.geminiModel : undefined;

  const apiKey = await getGeminiSecret();

  if (!apiKey) {
    console.warn('[AI Chatbot] No Gemini API key found in Secret Manager or env. Using default AI instance.');
    return ai;
  }

  // Return cached instance if key and model haven't changed
  if (cachedAi && cachedApiKey === apiKey && cachedModel === geminiModel) {
    return cachedAi;
  }

  // Key or model changed — create new instance and reset tool cache
  cachedAi = createAi(apiKey, geminiModel);
  cachedApiKey = apiKey;
  cachedModel = geminiModel;
  cachedTools = null;
  return cachedAi;
}

/**
 * Define tools once per AI instance and cache them.
 */
function getTools(currentAi: ReturnType<typeof createAi>) {
  if (cachedTools) return cachedTools;

  const getAvailableDevices = currentAi.defineTool(
    {
      name: 'getAvailableDevices',
      description: 'Returns a list of currently available TimeWaver devices in the rental catalog.',
      inputSchema: z.object({}),
      outputSchema: z.array(z.object({
        id: z.string(),
        type: z.string(),
        typeCode: z.string(),
        monthlyPrice: z.number(),
        description: z.string().optional()
      })),
    },
    async () => {
      const { firestore } = initializeFirebase();
      const q = query(collection(firestore, 'devices'), where('status', '==', 'available'), limit(10));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          type: data.type,
          typeCode: data.typeCode,
          monthlyPrice: data.price?.['12m']?.monthly || 0,
          description: data.description
        };
      });
    }
  );

  cachedTools = [getAvailableDevices];
  return cachedTools;
}

export async function askChatbot(input: ChatbotInput): Promise<ChatbotOutput> {
  try {
    const currentAi = await getAiInstance();
    const tools = getTools(currentAi);

    // Build application context from client-provided data
    let applicationContext = '';
    if (input.userApplications && input.userApplications.length > 0) {
      const appList = input.userApplications.map(app =>
        `- ${app.deviceType}: ステータス「${app.status}」(申請日: ${app.createdAt})`
      ).join('\n');
      applicationContext = `\n\nUser's current applications:\n${appList}`;
    } else if (input.userId) {
      applicationContext = '\n\nThe user is logged in but has no recent applications.';
    }

    const systemPrompt = `You are an AI support assistant for the TimeWaver rental platform "${input.serviceName || 'TimeWaverHub'}".
Your role is to provide helpful, accurate, and professional information to users.

If a user asks about what devices are available or for recommendations, use the 'getAvailableDevices' tool.

Knowledge Base:
- Rental procedures: Users must register, choose a device, upload identity docs, and wait for admin approval (1-3 days).
- Devices: TimeWaver Mobile (portable), MQ (Quantum/Advanced), Tabletop (Professional/Static), Frequency (E-medicine).
- Support: You can assist with navigation, troubleshooting basic operation, and explaining contract terms.
- Application statuses: pending=審査待ち, approved=承認済み, awaiting_consent_form=同意書待ち, consent_form_review=同意書審査中, payment_sent=決済リンク送付済み, completed=決済完了, shipped=発送済み, in_use=利用中, rejected=却下, canceled=キャンセル${applicationContext}

Guidelines:
- If a user asks about their application status and they have applications listed above, respond with the details.
- If a user asks about their application status but is not logged in, ask them to log in.
- If they ask for help with the rental process, guide them through the "Guide" page steps.
- If the question is outside your knowledge, suggest they contact human support.
- Always be polite and use a welcoming tone.
- Respond in the same language the user uses (default: Japanese).

Formatting:
- Use markdown for structured responses. Use **bold** for emphasis, numbered lists for steps, and bullet lists for options.
- Keep responses concise but well-formatted for readability.
- Use line breaks between sections to improve readability.`;

    const { output } = await currentAi.generate({
      system: systemPrompt,
      prompt: input.query,
      tools,
      output: { schema: ChatbotOutputSchema },
    });

    if (!output) {
      return { answer: '申し訳ありません。回答を生成できませんでした。もう一度お試しください。' };
    }

    return output;
  } catch (error: any) {
    console.error('[AI Chatbot] Error in askChatbot:', error?.message || error);
    console.error('[AI Chatbot] Stack:', error?.stack);

    return {
      answer: '申し訳ありません。AIサービスに接続できませんでした。しばらくしてから再度お試しいただくか、サポート窓口までご連絡ください。'
    };
  }
}
