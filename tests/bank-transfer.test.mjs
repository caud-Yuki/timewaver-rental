/**
 * 銀行振込フローの通し検証（案内送付 → 入金確認 → 契約作成）
 *
 *   npm run test:bank-transfer
 *
 * Firestore + Functions エミュレータ上で、管理画面が実際に行う書き込み
 * （applications の status 更新）だけを行い、あとは本番と同じ
 * onApplicationUpdate トリガーに処理させる。本番プロジェクトには接続しない。
 *
 * 検証したいこと:
 *   1. 銀行振込案内の送付で、請求金額・振込期限・案内送付日時が申請に刻まれること
 *      （金額はクライアントの payAmount ではなくサーバー再計算値であること）
 *   2. 入金確認で契約（subscriptions）が作られ、デバイスが貸出中になり、
 *      契約開始日がデバイスにも刻まれること = マイページの表示がカード決済と揃うこと
 *   3. 入金確認を取りこぼしや再操作で二重に処理しても契約が重複しないこと
 *   4. 案内メールのテンプレートが管理UIの選択肢と一致し、差し込みが全て解決すること
 *      （＝ {{...}} が残ったメールが送られないこと）
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// admin SDK は functions/lib が使うのと同じインスタンスを掴む（pricing テストと同じ理由）。
const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getFirestore, Timestamp } = requireFromFunctions('firebase-admin/firestore');

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'twrental-bank-test';

initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();

const { SYSTEM_TEMPLATES } = await import('../functions/lib/email-defaults.js');
const { buildTemplateData } = await import('../functions/lib/triggers.js');

const results = [];
async function it(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    results.push(['FAIL', name]);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m\n      ${String(err.message).split('\n')[0]}`);
  }
}

/**
 * functions/src/index.ts の addBusinessDays と同じ規則（土日を飛ばす）。
 *
 * ただし **UTC で数える**。Cloud Functions（本番・エミュレータとも）は UTC で動くので、
 * トリガー側の `new Date()` / `getDay()` / `setDate()` は UTC 基準になる。テストプロセスは
 * ホストのタイムゾーン（JST）で動くため、ローカルの getter で数えると JST 深夜〜午前に
 * 実行したときだけ 1 日ズレて落ちる。比較する側を UTC にそろえる。
 *
 * 裏を返すと、案内メールに載る「振込期限」も UTC 起算の日付である（JST 00:00〜09:00 に
 * 送付すると JST の 1 日前に見える）。docs/FLOW-bank-transfer.md の既知の制限を参照。
 */
function addBusinessDaysUTC(date, days) {
  let count = 0;
  const result = new Date(date);
  while (count < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (result.getUTCDay() !== 0 && result.getUTCDay() !== 6) count++;
  }
  return result;
}

/** UTC での年月日だけを取り出す（時刻差を無視して日付だけ比較するため）。 */
const utcDate = (d) => d.toISOString().slice(0, 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * トリガーは非同期に走るので、期待する状態になるまで待つ。
 * fn が truthy を返したらその値を返し、時間切れなら直近の値を添えて失敗させる。
 */
async function waitFor(label, fn, timeoutMs = 30000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await fn();
    if (last) return last;
    await sleep(400);
  }
  throw new Error(`タイムアウト(${timeoutMs}ms): ${label}`);
}

const DEVICE = 'device_tw';
const USER = 'user_taro';
const APP_ID = 'app_bank_transfer';
const DEADLINE_DAYS = 5;   // 振込期限（営業日）
const BUFFER_DAYS = 3;     // 発送バッファ（営業日）= 契約開始日

const SETTINGS = {
  serviceName: 'TimeWaverHub',
  companyName: '株式会社カウデザイン',
  managerName: '管理 太郎',
  managerEmail: 'admin@example.com',
  companyPhone: '03-0000-0000',
  companyPostalCode: '150-0001',
  companyPrefecture: '東京都',
  companyCity: '渋谷区',
  companyAddress: '神宮前1-1-1',
  moduleBasePrice: 1000,
  shippingBufferDays: BUFFER_DAYS,
  bankTransferDeadlineDays: DEADLINE_DAYS,
  bankTransfer: {
    bankName: 'みずほ銀行',
    branch: '渋谷支店',
    accountType: '普通',
    accountNumber: '1234567',
    accountHolder: 'カ）カウデザイン',
    note: '振込手数料はお客様負担にてお願いいたします。',
  },
};

// 一括払い 12ヶ月: 550,000 + モジュール(3pt+2pt=¥5,000/月) × 12 = 610,000
const EXPECTED_AMOUNT = 610000;

async function seed() {
  await db.collection('devices').doc(DEVICE).set({
    type: 'TimeWaver Pro',
    status: 'available',
    price: {
      '3m': { monthly: 60000, full: 170000 },
      '6m': { monthly: 55000, full: 320000 },
      '12m': { monthly: 50000, full: 550000 },
    },
    modules: [
      { id: 'm1', name: 'Module A', point: 3 },
      { id: 'm2', name: 'Module B', point: 2 },
    ],
  });

  await db.collection('settings').doc('global').set(SETTINGS);

  await db.collection('users').doc(USER).set({
    email: 'taro@example.com',
    familyName: '山田',
    givenName: '太郎',
    role: 'user',
  });

  // 通知イベントは「設定済みだが送信は無効」にする。テンプレート解決までは
  // 本番同様に走り、実際のメール送信（メールアカウント未設定）には進まない。
  const events = {
    bank_transfer_instructions: {
      userTemplateId: 'sys_bank_transfer_instructions',
      adminTemplateId: 'sys_bank_transfer_pending_admin',
    },
    payment_completed: { userTemplateId: 'sys_payment_completed' },
    device_prep_required: { adminTemplateId: 'sys_device_prep_required' },
  };
  for (const [eventId, tpl] of Object.entries(events)) {
    await db.collection('emailTriggers').doc(eventId).set({
      ...tpl,
      enabled: false,
      channels: { email: true },
    });
  }
}

async function createApplication() {
  await db.collection('applications').doc(APP_ID).set({
    userId: USER,
    userName: '山田 太郎',
    userEmail: 'taro@example.com',
    deviceId: DEVICE,
    deviceType: 'TimeWaver Pro',
    rentalType: 12,
    payType: 'full',
    payAmount: 1,           // ← クライアント改ざん値。サーバーが上書きするはず。
    status: 'consent_form_approved',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  // onApplicationCreate による金額正規化を待ってから状態遷移を始める。
  await waitFor('申込作成時のサーバー金額正規化', async () => {
    const d = (await db.collection('applications').doc(APP_ID).get()).data();
    return d?.payAmount === EXPECTED_AMOUNT ? d : null;
  });
}

const appDoc = () => db.collection('applications').doc(APP_ID).get().then((d) => d.data());
const deviceDoc = () => db.collection('devices').doc(DEVICE).get().then((d) => d.data());
const subsForApp = async () => {
  const snap = await db.collection('subscriptions').where('applicationId', '==', APP_ID).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

await seed();
await createApplication();

// ---------------------------------------------------------------------------
console.log('\n1. 銀行振込案内の送付（管理画面「銀行振込案内」ボタン相当）');

let afterInstructions;

await it('案内送付で請求金額・振込期限・案内送付日時が申請に刻まれる', async () => {
  // 管理画面 handleSendBankTransfer と同じ書き込み。
  await db.collection('applications').doc(APP_ID).update({
    status: 'awaiting_bank_transfer',
    paymentMethod: 'bank_transfer',
    updatedAt: Timestamp.now(),
  });

  afterInstructions = await waitFor('bankTransfer の書き込み', async () => {
    const d = await appDoc();
    return d?.bankTransfer?.amount ? d : null;
  });

  assert.equal(afterInstructions.paymentMethod, 'bank_transfer');
  assert.ok(afterInstructions.bankTransfer.instructionsSentAt, '案内送付日時が無い');
  assert.ok(afterInstructions.bankTransfer.deadline, '振込期限が無い');
});

await it('★ 請求金額はクライアントの payAmount ではなくサーバー再計算値', async () => {
  assert.equal(afterInstructions.bankTransfer.amount, EXPECTED_AMOUNT);
  assert.equal(afterInstructions.payAmount, EXPECTED_AMOUNT);
});

await it('振込期限は settings.bankTransferDeadlineDays（営業日）で決まる', async () => {
  const expected = addBusinessDaysUTC(new Date(), DEADLINE_DAYS);
  const actual = new Date(afterInstructions.bankTransfer.deadline);
  // 秒単位のズレは無視して日付（UTC）で比較する。
  assert.equal(utcDate(actual), utcDate(expected));
});

await it('入金確認前は契約（subscriptions）が作られていない', async () => {
  assert.equal((await subsForApp()).length, 0);
});

// ---------------------------------------------------------------------------
console.log('\n2. 入金確認（管理画面「入金確認」ボタン相当）');

let subscription;

await it('入金確認で契約が1件作成される', async () => {
  // 管理画面 handleConfirmBankTransfer と同じ書き込み。
  await db.collection('applications').doc(APP_ID).update({
    status: 'completed',
    'bankTransfer.confirmedBy': 'admin_uid',
    updatedAt: Timestamp.now(),
  });

  const subs = await waitFor('subscriptions の作成', async () => {
    const s = await subsForApp();
    return s.length ? s : null;
  });
  assert.equal(subs.length, 1);
  subscription = subs[0];
});

await it('契約の金額・支払区分・決済手段が銀行振込として記録される', async () => {
  assert.equal(subscription.payAmount, EXPECTED_AMOUNT);
  assert.equal(subscription.payType, 'full');
  assert.equal(subscription.paymentMethod, 'bank_transfer');
  assert.equal(subscription.status, 'active');
  assert.equal(subscription.rentalMonths, 12);
  // Stripe を経由しないので決済IDは持たない。
  assert.equal(subscription.stripePaymentIntentId, null);
  assert.equal(subscription.stripeSubscriptionId, null);
});

await it('契約期間は発送バッファ（営業日）起算の12ヶ月', async () => {
  const start = subscription.startAt.toDate();
  const end = subscription.endAt.toDate();
  assert.equal(utcDate(start), utcDate(addBusinessDaysUTC(new Date(), BUFFER_DAYS)));
  const expectedEnd = new Date(start);
  expectedEnd.setUTCMonth(expectedEnd.getUTCMonth() + 12);
  assert.equal(utcDate(end), utcDate(expectedEnd));
});

await it('入金確認日時が申請に記録される', async () => {
  const d = await waitFor('confirmedAt の書き込み', async () => {
    const a = await appDoc();
    return a?.bankTransfer?.confirmedAt ? a : null;
  });
  assert.equal(d.bankTransfer.confirmedBy, 'admin_uid');
});

await it('★ デバイスが貸出中になり、契約開始日が刻まれる（マイページの契約開始日）', async () => {
  const device = await waitFor('デバイスの契約開始日', async () => {
    const dev = await deviceDoc();
    return dev?.contractStartAt ? dev : null;
  });
  assert.equal(device.status, 'active');
  assert.equal(device.currentUserId, USER);
  assert.equal(
    utcDate(device.contractStartAt.toDate()),
    utcDate(subscription.startAt.toDate()),
  );
});

await it('★ 入金確認をやり直しても契約は重複しない', async () => {
  await db.collection('applications').doc(APP_ID).update({ status: 'in_use', updatedAt: Timestamp.now() });
  await waitFor('in_use への遷移', async () => ((await appDoc())?.status === 'in_use' ? true : null));
  await db.collection('applications').doc(APP_ID).update({ status: 'completed', updatedAt: Timestamp.now() });
  await sleep(3000);
  assert.equal((await subsForApp()).length, 1);
});

// ---------------------------------------------------------------------------
console.log('\n3. 案内メールのテンプレート');

const TEMPLATES = Object.fromEntries(SYSTEM_TEMPLATES.map((t) => [t.id, t]));

await it('管理UIが銀行振込案内に割り当てているテンプレートが実在する', async () => {
  // 管理UI（email-triggers）の行定義と email-defaults の実体がズレると、
  // 送信時にテンプレートが見つからず通知が黙って落ちる。
  const page = fs.readFileSync(new URL('../src/app/admin/email-triggers/page.tsx', import.meta.url), 'utf8');
  const row = page.split('\n').find((l) => l.includes("id: 'bank_transfer_instructions'"));
  assert.ok(row, '管理UIに銀行振込案内のイベント行が無い');
  const ids = [...row.matchAll(/sys(?:User|Admin): '(sys_[a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['sys_bank_transfer_instructions', 'sys_bank_transfer_pending_admin']);
  for (const id of ids) assert.ok(TEMPLATES[id], `テンプレート ${id} が定義されていない`);
});

/** 送信直前の本文と同じものを組み立てる（triggers.ts の置換ループと同じ規則）。 */
function render(templateId, recipient, data) {
  const t = TEMPLATES[templateId];
  const values = buildTemplateData(SETTINGS, recipient, data);
  let subject = t.subject;
  let body = t.body;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    subject = subject.replace(re, String(value));
    body = body.replace(re, String(value));
  }
  return { subject, body };
}

// トリガーが案内メールに渡すデータ（functions/src/index.ts の transferData と同じ形）。
const transferData = {
  deviceType: 'TimeWaver Pro',
  applicationId: APP_ID,
  transferAmount: EXPECTED_AMOUNT.toLocaleString(),
  transferDeadline: '2026/9/1',
};

await it('★ 利用者向け案内メールに未解決の差し込みが残らない', async () => {
  const { subject, body } = render(
    'sys_bank_transfer_instructions',
    { name: '山田 太郎', email: 'taro@example.com' },
    transferData,
  );
  assert.equal(subject.match(/\{\{.+?\}\}/g), null, `件名に未解決の差し込み: ${subject}`);
  assert.equal(body.match(/\{\{.+?\}\}/g), null, `本文に未解決の差し込み: ${body.match(/\{\{.+?\}\}/g)}`);
});

await it('案内メールに口座情報・金額・期限・申請番号が入る', async () => {
  const { body } = render(
    'sys_bank_transfer_instructions',
    { name: '山田 太郎', email: 'taro@example.com' },
    transferData,
  );
  for (const expected of [
    SETTINGS.bankTransfer.bankName,
    SETTINGS.bankTransfer.branch,
    SETTINGS.bankTransfer.accountNumber,
    SETTINGS.bankTransfer.accountHolder,
    SETTINGS.bankTransfer.note,
    transferData.transferAmount,
    transferData.transferDeadline,
    APP_ID,
  ]) {
    assert.ok(body.includes(expected), `本文に「${expected}」が無い`);
  }
});

await it('★ 管理者向け入金待ち通知にも未解決の差し込みが残らない', async () => {
  const { subject, body } = render(
    'sys_bank_transfer_pending_admin',
    { name: 'スタッフ', email: SETTINGS.managerEmail },
    transferData,
  );
  assert.equal(subject.match(/\{\{.+?\}\}/g), null, `件名に未解決の差し込み: ${subject}`);
  assert.equal(body.match(/\{\{.+?\}\}/g), null, `本文に未解決の差し込み: ${body.match(/\{\{.+?\}\}/g)}`);
  assert.ok(body.includes(APP_ID));
});

const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
