/**
 * One-off seed script for the AI knowledge base (QA list).
 * Populates qaCategories + qaItems via the Admin SDK (bypasses security rules).
 * Idempotent: uses fixed document IDs, so re-running overwrites rather than duplicates.
 *
 * Run: node scripts/seed-qa.cjs
 */
const admin = require('firebase-admin');
const path = require('path');
const key = require(path.join(__dirname, '..', 'functions', 'serviceAccountKey.json'));

admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();

const categories = [
  { id: 'cat_pricing',  name: '料金・お支払い',   order: 0, description: '月額料金、支払い方法、初期費用、解約や返金に関する質問' },
  { id: 'cat_flow',     name: 'レンタルの流れ',   order: 1, description: '申込から審査・同意書・決済・発送・利用開始までの手順や日数' },
  { id: 'cat_device',   name: '機器・デバイス',   order: 2, description: 'デバイスの種類、スペック、モジュール、付属品に関する質問' },
  { id: 'cat_contract', name: '同意書・契約',     order: 3, description: '契約条件、利用規約、同意書、解約条件、賠償責任に関する質問' },
  { id: 'cat_support',  name: '故障・サポート',   order: 4, description: '故障時の対応、返却方法、点検、トラブルに関する質問' },
];

const items = [
  // 料金・お支払い
  { id: 'qa_price_period',  categoryId: 'cat_pricing', order: 0, question: 'レンタル期間はどのくらいですか？', answer: '3ヶ月・6ヶ月・12ヶ月の3プランからお選びいただけます。期間が長いプランほど月額がお得になります。' },
  { id: 'qa_price_pay',     categoryId: 'cat_pricing', order: 1, question: '支払い方法は何が使えますか？', answer: 'クレジットカードによる月額払い、または一括払いに対応しています。一括払いには割引が適用される場合があります。決済リンクが送られてきましたら、そちらからお手続きください。' },
  { id: 'qa_price_cancel',  categoryId: 'cat_pricing', order: 2, question: '途中で解約できますか？返金はありますか？', answer: '契約期間中の中途解約は可能ですが、原則として既にお支払いいただいた料金の返金はございません。詳細は同意書の中途解約に関する条項をご確認ください。' },
  // レンタルの流れ
  { id: 'qa_flow_steps',    categoryId: 'cat_flow', order: 0, question: '申込から利用開始までの流れを教えてください', answer: '1) 機器一覧からデバイスを選んでレンタル申請 → 2) 管理者による審査（1〜3営業日）→ 3) 同意書のご提出 → 4) 決済リンクでのお支払い → 5) デバイスの発送 → 6) 利用開始、という流れです。' },
  { id: 'qa_flow_review',   categoryId: 'cat_flow', order: 1, question: '審査にはどのくらいかかりますか？', answer: '通常1〜3営業日で審査結果をご案内します。混雑状況により前後する場合があります。マイページの申請状況からいつでもステータスをご確認いただけます。' },
  // 機器・デバイス
  { id: 'qa_device_types',  categoryId: 'cat_device', order: 0, question: 'どんなデバイスがレンタルできますか？', answer: '現在ご利用可能なデバイスは機器一覧ページでご確認いただけます。AIに「利用可能なデバイスを教えて」と聞いていただければ、最新の在庫から一覧をご案内します。' },
  { id: 'qa_device_module', categoryId: 'cat_device', order: 1, question: 'モジュールやオプションは追加できますか？', answer: 'デバイスによって追加可能なモジュールが異なります。各デバイスの詳細ページに対応モジュールが記載されていますのでご確認ください。' },
  // 同意書・契約
  { id: 'qa_contract_what', categoryId: 'cat_contract', order: 0, question: '同意書にはどんな内容が書かれていますか？', answer: '基本利用条件・詳細利用規約・同意確認事項・署名欄で構成されています。具体的な条文についてはAIに「同意書の内容を教えて」とお聞きください。' },
  { id: 'qa_contract_damage', categoryId: 'cat_contract', order: 1, question: '機器を壊してしまったらどうなりますか？', answer: 'レンタル期間中の破損・紛失・盗難については、お客様に賠償責任が生じる場合があります。詳細は同意書の損害・紛失に関する条項をご確認ください。まずはサポート窓口へご連絡ください。' },
  // 故障・サポート
  { id: 'qa_support_broken', categoryId: 'cat_support', order: 0, question: '機器が故障したときはどうすればいいですか？', answer: 'まずはサポート窓口までご連絡ください。お客様の過失によらない自然故障の場合は、代替機の手配や修理対応をご案内します。' },
  { id: 'qa_support_return', categoryId: 'cat_support', order: 1, question: '返却はどうやって行いますか？', answer: '契約満了が近づきましたら返却手続きのご案内をお送りします。案内に従って梱包・返送いただき、到着後に点検を行って返却完了となります。' },
];

(async () => {
  const batch = db.batch();
  for (const c of categories) {
    const { id, ...data } = c;
    batch.set(db.collection('qaCategories').doc(id), { ...data, isPublic: true, createdAt: now, updatedAt: now }, { merge: true });
  }
  for (const it of items) {
    const { id, ...data } = it;
    batch.set(db.collection('qaItems').doc(id), { ...data, isPublic: true, createdAt: now, updatedAt: now }, { merge: true });
  }
  await batch.commit();
  console.log(`Seeded ${categories.length} categories and ${items.length} QA items.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
