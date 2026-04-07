
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

    // Fetch admin-configured AI context from settings
    const { firestore: fsInstance } = initializeFirebase();
    const settingsSnap = await getDoc(doc(fsInstance, 'settings', 'global'));
    const settingsData = settingsSnap.exists() ? settingsSnap.data() : {};
    const aiContext = settingsData?.aiContext || '';
    const svcName = input.serviceName || settingsData?.serviceName || 'TimeWaverHub';

    // Fetch current device lineup for context
    let deviceContext = '';
    try {
      const devicesSnap = await getDocs(query(collection(fsInstance, 'devices'), limit(20)));
      if (!devicesSnap.empty) {
        const deviceLines = devicesSnap.docs.map(d => {
          const data = d.data();
          const price12m = data.price?.['12m']?.monthly;
          const statusJa = data.status === 'available' ? '利用可能' : data.status === 'active' ? '使用中' : data.status === 'under_review' ? '審査中' : data.status;
          return `- ${data.type} (${data.serialNumber}): ${statusJa}, 月額¥${price12m?.toLocaleString() || '?'}/月(12ヶ月)`;
        }).join('\n');
        deviceContext = `\n\n# 現在のデバイスラインナップ\n${deviceLines}`;
      }
    } catch { /* non-critical */ }

    // Build application context from client-provided data
    let applicationContext = '';
    if (input.userApplications && input.userApplications.length > 0) {
      const appList = input.userApplications.map(app =>
        `- ${app.deviceType}: ステータス「${app.status}」(申請日: ${app.createdAt})`
      ).join('\n');
      applicationContext = `\n\n# ユーザーの申請状況\n${appList}`;
    } else if (input.userId) {
      applicationContext = '\n\n# ユーザーの申請状況\nログイン済みですが、現在の申請はありません。';
    }

    // Build system prompt with admin-configured context
    const adminContext = aiContext
      ? `\n\n--- 管理者が設定したサービスコンテキスト ---\n${aiContext}\n--- ここまで ---`
      : '';

    const systemPrompt = `You are an AI support assistant for the TimeWaver rental platform "${svcName}".
Your role is to provide helpful, accurate, and professional information to users.

If a user asks about what devices are available or for recommendations, use the 'getAvailableDevices' tool.
${adminContext}${deviceContext}

# ステータス一覧
pending=審査待ち, awaiting_consent_form=同意書待ち, consent_form_review=同意書審査中, consent_form_approved=同意書承認, payment_sent=決済リンク送付済み, completed=決済完了, shipped=発送済み, in_use=利用中, expired=契約満了, returning=返却手続中, inspection=点検中, returned=返却完了, closed=終了, rejected=却下, canceled=キャンセル${applicationContext}

# ガイドライン
- ユーザーの申請状況が上記に記載されている場合は、その情報を元に回答してください。
- ログインしていないユーザーが申請状況を聞いた場合は、ログインを案内してください。
- レンタルの流れについて聞かれた場合は、ガイドページの手順を案内してください。
- 回答できない質問には、サポート窓口への問い合わせを案内してください。
- 常に丁寧で親しみやすいトーンで応対してください。
- ユーザーが使用する言語で回答してください（デフォルト: 日本語）。

# フォーマット
- Markdown形式で回答。**太字**で強調、番号付きリストで手順、箇条書きで選択肢。
- 簡潔かつ読みやすく。セクション間は改行を入れる。`;

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
