
'use server';
/**
 * @fileOverview An AI support chatbot for the TimeWaver rental platform.
 *
 * - askChatbot - A function that handles user queries for the AI chatbot.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { initializeFirebase } from '@/firebase';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';

const ChatbotInputSchema = z.object({
  query: z.string().describe('The user\'s question about the TimeWaver rental platform, rental procedures, payment, or TimeWaver devices.')
});
export type ChatbotInput = z.infer<typeof ChatbotInputSchema>;

const ChatbotOutputSchema = z.object({
  answer: z.string().describe('The AI\'s answer to the user\'s question.')
});
export type ChatbotOutput = z.infer<typeof ChatbotOutputSchema>;

/**
 * Tool to list available devices in the catalog.
 */
const getAvailableDevices = ai.defineTool(
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
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type,
        typeCode: data.typeCode,
        monthlyPrice: data.price?.['12m']?.monthly || 0,
        description: data.description
      };
    });
  }
);

const aiSupportChatbotPrompt = ai.definePrompt({
  name: 'aiSupportChatbotPrompt',
  input: {schema: ChatbotInputSchema},
  output: {schema: ChatbotOutputSchema},
  tools: [getAvailableDevices],
  prompt: `You are an AI support assistant for the TimeWaver rental platform "ChronoRent". 
Your role is to provide helpful, accurate, and professional information to users.

If a user asks about what devices are available or for recommendations, use the 'getAvailableDevices' tool to fetch real data from our catalog.

Knowledge Base:
- Rental procedures: Users must register, choose a device, upload identity docs, and wait for admin approval (1-3 days).
- Devices: TimeWaver Mobile (portable), MQ (Quantum/Advanced), Tabletop (Professional/Static), Frequency (E-medicine).
- Support: You can assist with navigation, troubleshooting basic operation, and explaining contract terms.

Guidelines:
- If a user asks about their specific application status, tell them to check the "My Page" dashboard under "Application History".
- If they ask for help with the rental process, guide them through the "Guide" page steps.
- If the question is outside your knowledge, suggest they contact human support at support@chronorent.com.
- Always be polite and use a welcoming tone.

User's Query: {{{query}}}`
});

export async function askChatbot(input: ChatbotInput): Promise<ChatbotOutput> {
  const {output} = await aiSupportChatbotPrompt(input);
  return output!;
}
