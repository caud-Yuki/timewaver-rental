'use server';
/**
 * @fileOverview An AI support chatbot for the TimeWaver rental platform.
 *
 * - askChatbot - A function that handles user queries for the AI chatbot.
 * - ChatbotInput - The input type for the askChatbot function.
 * - ChatbotOutput - The return type for the askChatbot function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ChatbotInputSchema = z.object({
  query: z.string().describe('The user\'s question about the TimeWaver rental platform, rental procedures, payment, or TimeWaver devices.')
});
export type ChatbotInput = z.infer<typeof ChatbotInputSchema>;

const ChatbotOutputSchema = z.object({
  answer: z.string().describe('The AI\'s answer to the user\'s question.')
});
export type ChatbotOutput = z.infer<typeof ChatbotOutputSchema>;

export async function askChatbot(input: ChatbotInput): Promise<ChatbotOutput> {
  return aiSupportChatbotFlow(input);
}

const aiSupportChatbotPrompt = ai.definePrompt({
  name: 'aiSupportChatbotPrompt',
  input: {schema: ChatbotInputSchema},
  output: {schema: ChatbotOutputSchema},
  prompt: `You are an AI support assistant for the TimeWaver rental platform. Your role is to provide helpful and accurate information to users regarding:
- How to use the rental platform (e.g., account management, navigation).
- Rental procedures (e.g., how to apply, contract terms, device handling).
- Payment inquiries (e.g., payment methods, billing, refunds).
- Information about TimeWaver devices (e.g., types, modules, features, general usage).

Answer the user's query clearly and concisely based on the information implicitly available about the platform's features and operations. If you cannot find a direct answer, guide the user on where they might find it or suggest contacting human support.

User's Query: {{{query}}}`
});

const aiSupportChatbotFlow = ai.defineFlow(
  {
    name: 'aiSupportChatbotFlow',
    inputSchema: ChatbotInputSchema,
    outputSchema: ChatbotOutputSchema,
  },
  async input => {
    const {output} = await aiSupportChatbotPrompt(input);
    return output!;
  }
);
