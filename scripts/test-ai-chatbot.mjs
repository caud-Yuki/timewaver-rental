/**
 * End-to-end test of the AI support chatbot's knowledge-base reference logic.
 * Replicates the real tools + system prompt and calls Gemini with free-form questions.
 * Requires GEMINI_API_KEY in env. Reads QA/consent data via the Admin SDK.
 */
import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const key = JSON.parse(readFileSync(new URL('../functions/serviceAccountKey.json', import.meta.url)));
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

const settings = (await db.doc('settings/global').get()).data() || {};
const model = settings.geminiModel || 'googleai/gemini-2.5-flash';
const ai = genkit({ plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY })], model });

const calls = [];

const getQaByCategory = ai.defineTool(
  { name: 'getQaByCategory', description: 'Returns curated Q&A pairs for a knowledge-base category. Pass categoryId from the system prompt list.',
    inputSchema: z.object({ categoryId: z.string() }), outputSchema: z.array(z.object({ question: z.string(), answer: z.string() })) },
  async ({ categoryId }) => {
    calls.push(`getQaByCategory(${categoryId})`);
    const snap = await db.collection('qaItems').where('categoryId', '==', categoryId).orderBy('order', 'asc').get();
    return snap.docs.map(d => ({ question: d.data().question, answer: d.data().answer })).filter(x => x.question && x.answer);
  }
);

const getConsentFormContent = ai.defineTool(
  { name: 'getConsentFormContent', description: 'Returns the full text of the rental consent form (利用同意書). Use for contract terms / consent questions.',
    inputSchema: z.object({}), outputSchema: z.string() },
  async () => {
    calls.push('getConsentFormContent()');
    const snap = await db.doc('consentForm/current').get();
    // Mirror production fallback: use default terms when Firestore doc is empty.
    const DEFAULT = [
      { order: 0, title: '基本利用条件', type: 'terms_list', items: ['使用目的：レンタル機器は申請時に申告した目的のみに使用する。', '機器の管理：善良な管理者の注意をもって適切に管理する。', '損害・紛失：レンタル期間中の破損・紛失・盗難は賠償義務を負う。'] },
      { order: 1, title: '詳細利用規約', type: 'terms_list', items: ['料金は所定の期日までに支払う。', '中途解約しても既払い料金は返金されない。', '改造・分解・第三者への譲渡を禁止する。'] },
    ];
    const raw = snap.exists && Array.isArray(snap.data().sections) && snap.data().sections.length ? snap.data().sections : DEFAULT;
    const sections = [...raw].sort((a, b) => a.order - b.order);
    const lines = [];
    for (const s of sections) {
      lines.push(`【${s.title}】`);
      if (s.content) lines.push(s.content);
      if (Array.isArray(s.items)) s.items.forEach((it, i) => lines.push(`${i + 1}. ${it}`));
    }
    return lines.join('\n') || '同意書の内容がまだ設定されていません。';
  }
);

// Build category context like the real flow does.
const cats = await db.collection('qaCategories').orderBy('order').get();
const catLines = cats.docs.map(d => `- ${d.data().name} (categoryId: ${d.id})${d.data().description ? ` — ${d.data().description}` : ''}`).join('\n');

const systemPrompt = `You are an AI support assistant for the TimeWaver rental platform "TimeWaverHub".

# ナレッジベースのカテゴリー一覧
${catLines}

# ナレッジベース参照ロジック（自由記述の質問への対応）
ツールで直接回答できない自由記述の質問を受けた場合は、必ず次の手順で対応してください:
1. 上記カテゴリー一覧から最も関連するカテゴリーを特定する。
2. 'getQaByCategory' に categoryId を渡してQ&Aを読み取る。
3. Q&Aの中から最も合致する回答を参照し、自然な文章で回答を生成する。
4. 同意書・契約・規約に関する質問は 'getConsentFormContent' を使う。
5. 関連カテゴリーが無く答えが見つからない場合は、推測せずサポート窓口への問い合わせを案内する。
日本語で丁寧に回答してください。`;

const Out = z.object({ answer: z.string() });
const questions = [
  'レンタルって何ヶ月から借りられるの？',
  '機器をうっかり壊しちゃったらどうなりますか？',
  '同意書ってどんなことが書いてあるんですか？',
  '御社の株価はいくらですか？',
];

for (const q of questions) {
  calls.length = 0;
  let answer;
  for (let attempt = 0; attempt < 2 && !answer; attempt++) {
    try {
      const { output } = await ai.generate({ system: systemPrompt, prompt: q, tools: [getQaByCategory, getConsentFormContent], output: { schema: Out } });
      answer = output?.answer;
    } catch (e) { /* transient structured-output null — retry once (prod try/catches too) */ }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Q: ' + q);
  console.log('🔧 tools used: ' + (calls.length ? calls.join(', ') : '(none)'));
  console.log('A: ' + (answer || '(fallback: generation failed — prod returns a polite retry message)'));
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('model: ' + model);
process.exit(0);
