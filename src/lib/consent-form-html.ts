import { Application, ConsentFormSection } from '@/types';

// ---------------------------------------------------------------------------
// Default sections (used when no Firestore data exists yet)
// ---------------------------------------------------------------------------
export const DEFAULT_CONSENT_SECTIONS: ConsentFormSection[] = [
  {
    id: 'basic_terms',
    order: 0,
    title: '基本利用条件',
    type: 'terms_list',
    items: [
      '使用目的：レンタル機器は、申請時に申告した目的のみに使用するものとし、第三者への転貸・転用を固く禁じます。',
      '機器の管理：お客様は、機器を善良な管理者の注意をもって適切に管理・保管する義務を負います。',
      '損害・紛失：レンタル期間中に生じた機器の破損・紛失・盗難については、お客様の責任においてその損害を賠償していただきます。',
      '改造の禁止：機器の改造・分解・加工は、いかなる理由があっても禁じます。',
      '返却義務：レンタル期間終了後は、速やかに当社が指定する方法で機器を返却してください。期日を超過した場合、超過日数に応じた延滞料が発生します。',
    ],
  },
  {
    id: 'detailed_terms',
    order: 1,
    title: '詳細利用規約',
    type: 'terms_list',
    items: [
      '料金の支払い：レンタル料金は、選択された支払いプランに従い期日までにお支払いください。支払いが遅延した場合、年利14.6%の遅延損害金が発生する場合があります。',
      '中途解約：お客様都合による中途解約の場合、残レンタル期間の料金の一部（解約違約金）をご負担いただく場合があります。詳細は申込時の料金表をご参照ください。',
      '自然消耗：通常の使用による消耗・劣化については、お客様の負担はありません。ただし、明らかな過失・故意による損傷は修理費用をご負担いただきます。',
      '個人情報：ご提供いただいた個人情報は、本サービスの提供および連絡のみに使用し、第三者へは提供しません（法令に基づく場合を除く）。',
      '禁止事項：以下の行為は固く禁じます。①機器の再レンタル・転貸。②法令に違反する目的での使用。③当社の許可なく機器に付属品・機能を追加すること。',
      'サービス変更・中断：当社は、事前通知のうえ本サービスの内容を変更または中断する場合があります。システムメンテナンス等による一時的な中断については責任を負いません。',
      '免責事項：天災・不可抗力による機器の故障・滅失については、当社は責任を負いません。ただし、代替機器の提供につき協議するものとします。',
      '反社会的勢力の排除：お客様は、現在および将来にわたり、暴力団その他の反社会的勢力でないことを表明・保証します。',
      '準拠法・管轄：本契約に関する紛争は、日本法を準拠法とし、当社所在地を管轄する裁判所を専属的合意管轄裁判所とします。',
      '規約の変更：当社は、本規約の内容を変更する場合があります。変更後も本サービスを継続して利用された場合、変更に同意したものとみなします。',
    ],
  },
  {
    id: 'consent_items',
    order: 2,
    title: '同意確認事項',
    type: 'consent_items',
    items: [
      '上記の基本利用条件および詳細利用規約を全て読み、理解しました。',
      'レンタル機器の管理責任、損害・紛失時の賠償義務を理解しました。',
      '料金・支払い条件、および中途解約の取り扱いについて理解しました。',
      '個人情報の取り扱いについて同意します。',
      '反社会的勢力に該当しないことを表明・保証します。',
      '本同意書の全ての内容に同意のうえ、署名します。',
    ],
  },
  {
    id: 'signature',
    order: 3,
    title: '署名欄',
    type: 'signature',
  },
];

// ---------------------------------------------------------------------------
// Render a single section to HTML
// ---------------------------------------------------------------------------
function renderSection(section: ConsentFormSection, serviceName: string): string {
  switch (section.type) {
    case 'paragraph':
      return `
<div class="section">
  <div class="section-title">${section.title}</div>
  <p class="terms-intro">${(section.content || '').replace(/\n/g, '<br>')}</p>
</div>`;

    case 'terms_list': {
      const items = (section.items || [])
        .map((item) => `<li>${item}</li>`)
        .join('');
      return `
<div class="section">
  <div class="section-title">${section.title}</div>
  <ol class="terms">${items}</ol>
</div>`;
    }

    case 'consent_items': {
      const items = (section.items || [])
        .map(
          (item) => `
  <div class="consent-item">
    <span class="checkbox"></span>
    <span>${item}</span>
  </div>`
        )
        .join('');
      return `
<div class="section">
  <div class="section-title">${section.title}</div>
  <div class="consent-items">${items}</div>
</div>`;
    }

    case 'signature':
      return `
<div class="signature-block">
  <p style="font-weight:700;margin-bottom:4mm;">署名欄（自筆にてご記入ください）</p>
  <div style="display:flex;gap:6mm;align-items:flex-start;">
    <div style="flex:1;">
      <div class="sig-row"><span class="sig-label">同意日</span><span class="sig-line">　　　　年　　月　　日</span></div>
      <div class="sig-row"><span class="sig-label">お名前（自署）</span><span class="sig-line"></span></div>
      <div class="sig-row"><span class="sig-label">ご住所</span><span class="sig-line"></span></div>
      <div class="sig-row"><span class="sig-label">電話番号</span><span class="sig-line"></span></div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:2mm;flex-shrink:0;">
      <span style="font-size:8pt;color:#555;">印鑑</span>
      <div style="width:22mm;height:22mm;border:1px solid #aaa;"></div>
    </div>
  </div>
  <p class="sig-note">※ 本同意書に署名後、${serviceName} マイページよりアップロードしてご提出ください。</p>
</div>`;

    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Shared CSS
// ---------------------------------------------------------------------------
const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif;
  font-size: 10pt;
  color: #111;
  background: #f0f0f0;
  padding: 24px 0;
}
.page {
  width: 210mm;
  background: #fff;
  margin: 0 auto 24px;
  padding: 20mm 22mm;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
}
.print-toolbar {
  width: 210mm;
  margin: 0 auto 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.print-btn {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 24px;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
}
.print-btn:hover { background: #1d4ed8; }
.doc-title {
  text-align: center;
  font-size: 18pt;
  font-weight: 700;
  letter-spacing: 0.2em;
  margin-bottom: 6mm;
  padding-bottom: 4mm;
  border-bottom: 2px solid #111;
}
.doc-subtitle { text-align: center; font-size: 9pt; color: #555; margin-bottom: 8mm; }
.section { margin-bottom: 7mm; }
.section-title {
  font-size: 10pt;
  font-weight: 700;
  background: #1e3a5f;
  color: #fff;
  padding: 2mm 4mm;
  margin-bottom: 3mm;
  letter-spacing: 0.05em;
}
table.info { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
table.info th {
  width: 38%;
  background: #f3f4f6;
  border: 1px solid #ccc;
  padding: 2.5mm 3mm;
  text-align: left;
  font-weight: 700;
  vertical-align: top;
}
table.info td { border: 1px solid #ccc; padding: 2.5mm 3mm; vertical-align: top; }
.terms-intro { font-size: 9.5pt; line-height: 1.7; margin-bottom: 5mm; }
ol.terms { padding-left: 5mm; font-size: 9pt; line-height: 1.8; }
ol.terms li { margin-bottom: 2.5mm; }
.consent-items { font-size: 9pt; line-height: 1.8; }
.consent-item { display: flex; align-items: flex-start; gap: 3mm; margin-bottom: 2mm; }
.checkbox { display: inline-block; width: 4mm; height: 4mm; border: 1px solid #666; flex-shrink: 0; margin-top: 1mm; }
.signature-block { margin-top: 8mm; border: 1px solid #ccc; padding: 5mm 6mm; font-size: 9.5pt; }
.sig-row { display: flex; align-items: flex-end; gap: 6mm; margin-bottom: 4mm; }
.sig-label { min-width: 30mm; font-weight: 700; }
.sig-line { flex: 1; border-bottom: 1px solid #aaa; padding-bottom: 1mm; min-height: 8mm; }
.sig-note { font-size: 8pt; color: #666; text-align: center; margin-top: 3mm; }
@media print {
  body { background: none; padding: 0; }
  .page { box-shadow: none; margin: 0; }
  .print-toolbar { display: none; }
  @page { size: A4; margin: 20mm; }
}
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
interface ConsentFormOptions {
  application: Application;
  serviceName: string;
  sections?: ConsentFormSection[];
}

function formatPayType(payType: string): string {
  return payType === 'monthly' ? '月次払い' : '一括払い';
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function generateConsentFormHtml({
  application,
  serviceName,
  sections,
}: ConsentFormOptions): string {
  const resolvedSections = (sections && sections.length > 0
    ? [...sections].sort((a, b) => a.order - b.order)
    : DEFAULT_CONSENT_SECTIONS);

  const today = formatDate(new Date());
  const rentalPeriod = (application.rentalType ?? application.rentalPeriod) ? `${application.rentalType ?? application.rentalPeriod}ヶ月` : '—';
  const payType = formatPayType(application.payType || '');
  const customerName = application.userName || '　　　　　　　　';
  const appId = application.id;
  const deviceType = application.deviceType || '';

  const sectionsHtml = resolvedSections.map((s) => renderSection(s, serviceName)).join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>機器レンタル同意書 — ${serviceName}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>

<div class="print-toolbar">
  <button class="print-btn" onclick="window.print()">印刷 / PDFで保存</button>
</div>

<div class="page">

  <div class="doc-title">機器レンタル同意書</div>
  <div class="doc-subtitle">${serviceName} 機器レンタルサービス</div>

  <div class="section">
    <div class="section-title">契約基本情報</div>
    <table class="info">
      <tr><th>申請番号</th><td>${appId}</td></tr>
      <tr><th>同意書作成日</th><td>${today}</td></tr>
      <tr><th>サービス事業者</th><td>${serviceName}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">ご契約者様情報</div>
    <table class="info">
      <tr><th>お名前</th><td>${customerName} 様</td></tr>
      <tr><th>メールアドレス</th><td>${application.userEmail || '　'}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">レンタル契約内容</div>
    <table class="info">
      <tr><th>レンタル機器</th><td>${deviceType}</td></tr>
      <tr><th>レンタル期間</th><td>${rentalPeriod}</td></tr>
      <tr><th>お支払い方法</th><td>${payType}</td></tr>
      <tr><th>契約開始日</th><td>機器発送日をもって契約開始とします</td></tr>
      <tr><th>契約終了日</th><td>契約開始日よりレンタル期間満了日</td></tr>
    </table>
  </div>

  ${sectionsHtml}

</div>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Plain-text export (for clipboard copy)
// ---------------------------------------------------------------------------
export function generateConsentFormText(
  sections: ConsentFormSection[],
  serviceName: string
): string {
  const lines: string[] = [`■ 機器レンタル同意書 — ${serviceName}`, ''];

  for (const section of [...sections].sort((a, b) => a.order - b.order)) {
    lines.push(`【${section.title}】`);
    if (section.type === 'paragraph' && section.content) {
      lines.push(section.content);
    } else if (
      (section.type === 'terms_list' || section.type === 'consent_items') &&
      section.items
    ) {
      section.items.forEach((item, i) => lines.push(`${i + 1}. ${item}`));
    } else if (section.type === 'signature') {
      lines.push('同意日：　　　　年　　月　　日');
      lines.push('お名前（自署）：');
      lines.push('ご住所：');
      lines.push('電話番号：');
    }
    lines.push('');
  }

  return lines.join('\n');
}
