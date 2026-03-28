
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
  userId: z.string().optional().describe('The ID of the currently logged-in user.')
});
export type ChatbotInput = z.infer<typeof ChatbotInputSchema>;

const ChatbotOutputSchema = z.object({
  answer: z.string().describe('The AI\'s answer to the user\'s question.')
});
export type ChatbotOutput = z.infer<typeof ChatbotOutputSchema>;

/**
 * Returns the appropriate AI instance — using the Secret Manager key and
 * the admin-selected model from Firestore settings.
 */
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

export async function askChatbot(input: ChatbotInput): Promise<ChatbotOutput> {
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
    }
  );

  // Define prompt with the current AI instance
  const aiSupportChatbotPrompt = currentAi.definePrompt({
    name: 'aiSupportChatbotPrompt',
    input: {schema: ChatbotInputSchema},
    output: {schema: ChatbotOutputSchema},
    tools: [getAvailableDevices, checkMyApplicationStatus],
    prompt: `You are an AI support assistant for the TimeWaver rental platform "ChronoRent".
Your role is to provide helpful, accurate, and professional information to users.

If a user asks about what devices are available or for recommendations, use the 'getAvailableDevices' tool.
If a user asks about their own application status and you have their userId ({{{userId}}}), use the 'checkMyApplicationStatus' tool.

Knowledge Base:
- Rental procedures: Users must register, choose a device, upload identity docs, and wait for admin approval (1-3 days).
- Devices: TimeWaver Mobile (portable), MQ (Quantum/Advanced), Tabletop (Professional/Static), Frequency (E-medicine).
- Support: You can assist with navigation, troubleshooting basic operation, and explaining contract terms.

Guidelines:
- If a user asks about their specific application status and you don't have their userId, ask them to log in.
- If they ask for help with the rental process, guide them through the "Guide" page steps.
- If the question is outside your knowledge, suggest they contact human support at support@chronorent.com.
- Always be polite and use a welcoming tone.

User's Query: {{{query}}}
User Context ID: {{{userId}}}`
  });

  const {output} = await aiSupportChatbotPrompt(input);
  return output!;
}
