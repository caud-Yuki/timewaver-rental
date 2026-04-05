
'use server';
/**
 * @fileOverview An AI support chatbot for the TimeWaver rental platform.
 *
 * - askChatbot - A function that handles user queries for the AI chatbot.
 * - Fetches the Gemini API key from Google Cloud Secret Manager.
 */

import {ai, createAi} from '@/ai/genkit';
import {z} from 'genkit';
import { initializeFirebase } from '@/firebase';
import { collection, getDocs, doc, getDoc, query, where, limit, orderBy } from 'firebase/firestore';
import { getGeminiSecret } from '@/lib/secret-actions';

const ChatbotInputSchema = z.object({
  query: z.string().describe('The user\'s question about the TimeWaver rental platform, rental procedures, payment, or TimeWaver devices.'),
  userId: z.string().optional().describe('The ID of the currently logged-in user.'),
  serviceName: z.string().optional().describe('The service/platform name to use in responses.')
});
export type ChatbotInput = z.infer<typeof ChatbotInputSchema>;

const ChatbotOutputSchema = z.object({
  answer: z.string().describe('The AI\'s answer to the user\'s question.')
});
export type ChatbotOutput = z.infer<typeof ChatbotOutputSchema>;

// Cache the AI instance to avoid re-creating genkit on every call
let cachedAi: ReturnType<typeof createAi> | null = null;
let cachedApiKey: string | null = null;
let cachedModel: string | undefined = undefined;

/**
 * Returns the appropriate AI instance — using the Secret Manager key and
 * the admin-selected model from Firestore settings.
 * Caches the instance to avoid re-registration warnings.
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

  cachedAi = createAi(apiKey, geminiModel);
  cachedApiKey = apiKey;
  cachedModel = geminiModel;
  return cachedAi;
}

export async function askChatbot(input: ChatbotInput): Promise<ChatbotOutput> {
  try {
    const currentAi = await getAiInstance();

    // Define tools with the current AI instance
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

    const checkMyApplicationStatus = currentAi.defineTool(
      {
        name: 'checkMyApplicationStatus',
        description: 'Checks the status of the user\'s recent rental applications.',
        inputSchema: z.object({
          userId: z.string().describe('The ID of the user whose applications to check.')
        }),
        outputSchema: z.array(z.object({
          deviceType: z.string(),
          status: z.string(),
          createdAt: z.string()
        })),
      },
      async ({ userId }) => {
        try {
          const { firestore } = initializeFirebase();
          const q = query(
            collection(firestore, 'applications'),
            where('userId', '==', userId),
            orderBy('createdAt', 'desc'),
            limit(3)
          );
          const snapshot = await getDocs(q);

          return snapshot.docs.map(docSnap => {
            const data = docSnap.data();
            return {
              deviceType: data.deviceType,
              status: data.status,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString() : '不明'
            };
          });
        } catch (error: any) {
          console.warn('[AI Chatbot] Could not check application status:', error.message);
          return [];
        }
      }
    );

    // Use generate() directly instead of definePrompt to avoid re-registration
    const systemPrompt = `You are an AI support assistant for the TimeWaver rental platform "${input.serviceName || 'TimeWaverHub'}".
Your role is to provide helpful, accurate, and professional information to users.

If a user asks about what devices are available or for recommendations, use the 'getAvailableDevices' tool.
If a user asks about their own application status and you have their userId (${input.userId || 'not logged in'}), use the 'checkMyApplicationStatus' tool.

Knowledge Base:
- Rental procedures: Users must register, choose a device, upload identity docs, and wait for admin approval (1-3 days).
- Devices: TimeWaver Mobile (portable), MQ (Quantum/Advanced), Tabletop (Professional/Static), Frequency (E-medicine).
- Support: You can assist with navigation, troubleshooting basic operation, and explaining contract terms.

Guidelines:
- If a user asks about their specific application status and you don't have their userId, ask them to log in.
- If they ask for help with the rental process, guide them through the "Guide" page steps.
- If the question is outside your knowledge, suggest they contact human support.
- Always be polite and use a welcoming tone.
- Respond in the same language the user uses (default: Japanese).`;

    const { output } = await currentAi.generate({
      system: systemPrompt,
      prompt: input.query,
      tools: [getAvailableDevices, checkMyApplicationStatus],
      output: { schema: ChatbotOutputSchema },
    });

    if (!output) {
      return { answer: '申し訳ありません。回答を生成できませんでした。もう一度お試しください。' };
    }

    return output;
  } catch (error: any) {
    console.error('[AI Chatbot] Error in askChatbot:', error?.message || error);
    console.error('[AI Chatbot] Stack:', error?.stack);

    // Return a user-friendly error instead of throwing a 500
    return {
      answer: '申し訳ありません。AIサービスに接続できませんでした。しばらくしてから再度お試しいただくか、サポート窓口までご連絡ください。'
    };
  }
}
