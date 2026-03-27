
/**
 * @fileOverview System default email templates for ChronoRent.
 * Expanded to cover all Section 4 trigger points.
 */

export interface SystemTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  type: "application" | "transaction" | "news" | "waiting" | "general";
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    id: 'sys_welcome_registration',
    name: '[標準] 会員登録完了',
    subject: '【ChronoRent】会員登録が完了しました',
    type: 'general',
    body: `{{userName}} 様\n\nChronoRent（クロノレント）への会員登録ありがとうございます。\n\n当プラットフォームでは、TimeWaverをより身近に、手軽にご利用いただけるレンタルサービスを提供しております。\n\nまずは「機器一覧」より、あなたに最適な一台をお探しください。`
  },
  {
    id: 'sys_application_submitted',
    name: '[標準] 申込受付完了',
    subject: '【ChronoRent】レンタル申込を受付いたしました',
    type: 'application',
    body: `{{userName}} 様\n\nTimeWaverのレンタルお申し込みをいただき、ありがとうございます。\n\n対象機器: {{deviceName}}\n現在、管理者にて審査を行っております。\n通常1〜3営業日以内に、結果をご案内させていただきます。`
  },
  {
    id: 'sys_consent_form_required',
    name: '[標準] 審査承認・同意書提出のお願い',
    subject: '【ChronoRent】審査承認および同意書のご提出について',
    type: 'application',
    body: `{{userName}} 様\n\nお申し込みいただいたTimeWaverのレンタル審査が承認されました。\n契約を完了するには、同意書の提出が必要です。\n\nマイページへログインし、「申請履歴」から同意書をダウンロード・署名の上、アップロードしてください。\n\nご提出いただいた同意書を管理者が確認次第、決済手続きのご案内をお送りします。`
  },
  {
    id: 'sys_consent_form_submitted',
    name: '[標準] 同意書提出のお知らせ（管理者宛）',
    subject: '【ChronoRent管理者】同意書の提出がありました',
    type: 'application',
    body: `管理者様\n\n以下の申請について、ユーザーから同意書の提出がありました。\n内容を確認し、承認処理を行ってください。\n\nユーザー名: {{userName}}\n申請ID: {{applicationId}}`
  },
  {
    id: 'sys_application_approved',
    name: '[標準] 審査承認・決済案内',
    subject: '【ChronoRent】同意書承認および決済のご案内',
    type: 'application',
    body: `{{userName}} 様\n\nご提出いただいた同意書を確認し、承認いたしました。\n以下のリンクより決済のお手続きをお願いいたします。\n\n■決済リンク\n{{paymentLink}}`
  },
  {
    id: 'sys_application_rejected',
    name: '[標準] 審査却下通知',
    subject: '【ChronoRent】レンタル申込に関するお知らせ',
    type: 'application',
    body: `{{userName}} 様\n\n今回は誠に残念ながら、ご利用を見送らせていただくこととなりました。\nご了承くださいますようお願い申し上げます。`
  },
  {
    id: 'sys_payment_completed',
    name: '[標準] 決済完了通知',
    subject: '【ChronoRent】決済完了および配送のお知らせ',
    type: 'transaction',
    body: `{{userName}} 様\n\n決済のお手続きありがとうございました。\nデバイスの発送準備を開始いたしました。\n\n対象機器: {{deviceName}}\nシリアル番号: {{serialNumber}}`
  },
  {
    id: 'sys_payment_failed',
    name: '[標準] 決済失敗通知',
    subject: '【重要】決済処理に失敗しました',
    type: 'transaction',
    body: `{{userName}} 様\n\n月次決済の処理に失敗いたしました。\nカードの有効期限や限度額をご確認の上、マイページより情報の更新をお願いいたします。`
  },
  {
    id: 'sys_contract_expired',
    name: '[標準] 契約終了通知',
    subject: '【ChronoRent】レンタル契約終了のお知らせ',
    type: 'transaction',
    body: `{{userName}} 様\n\n本日をもちましてTimeWaverのレンタル契約が終了いたしました。\n機器の返却手順につきましては、同梱のガイドをご確認ください。`
  },
  {
    id: 'sys_news_published',
    name: '[標準] ニュース公開通知',
    subject: '【ChronoRent】新しいお知らせがあります',
    type: 'news',
    body: `{{userName}} 様\n\nChronoRentより新しいニュースが公開されました。\n詳細は以下のリンクよりご確認ください。`
  },
  {
    id: 'sys_waitlist_available',
    name: '[標準] 在庫確保通知',
    subject: '【ChronoRent】ご希望の機器に空きが出ました',
    type: 'waiting',
    body: `{{userName}} 様\n\nキャンセル待ち登録をいただいておりました機器に空きが発生いたしました。\nお早めにお申し込み手続きをお願いいたします。`
  }
];
