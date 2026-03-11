
/**
 * @fileOverview System default email templates for ChronoRent.
 * These are used as fallbacks when no custom template is found in Firestore.
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
    name: '[システム] 会員登録完了通知',
    subject: '【ChronoRent】会員登録が完了しました',
    type: 'general',
    body: `{{userName}} 様\n\nChronoRent（クロノレント）への会員登録ありがとうございます。\n\n当プラットフォームでは、世界最高峰の量子情報場分析デバイス「TimeWaver」を、より身近に、手軽にご利用いただけるレンタルサービスを提供しております。\n\n■今後の流れ\n1. 機器一覧から希望のデバイスを選択\n2. レンタル期間と支払いプランを決定\n3. 本人確認書類をアップロードして申請\n\nまずは「機器一覧」より、あなたに最適な一台をお探しください。\n\nご不明な点がございましたら、マイページのAIサポートコンシェルジュまでお気軽にご相談ください。`
  },
  {
    id: 'sys_application_submitted',
    name: '[システム] 申込受付完了',
    subject: '【ChronoRent】レンタル申込を受付いたしました',
    type: 'application',
    body: `{{userName}} 様\n\nTimeWaverのレンタルお申し込みをいただき、誠にありがとうございます。\n以下の内容で受付いたしました。\n\n対象機器: {{deviceName}}\nプラン: {{rentalPeriod}}ヶ月 / {{payType}}\n\n現在、管理者にてお申し込み内容の確認（審査）を行っております。\n通常1〜3営業日以内に、審査結果および次のお手続きについてメールにてご案内させていただきます。\n\nお手続きの進捗状況は、マイページの「申請履歴」からもご確認いただけます。\n\n今しばらくお待ちください。`
  },
  {
    id: 'sys_application_approved',
    name: '[システム] 審査承認通知',
    subject: '【ChronoRent】レンタル申込の承認および決済のご案内',
    type: 'application',
    body: `{{userName}} 様\n\nお待たせいたしました。\n先日お申し込みいただいたTimeWaverのレンタルにつきまして、審査が完了し「承認」されましたことをお知らせいたします。\n\n機器の発送準備に入らせていただくため、以下のリンクより決済のお手続きをお願いいたします。\n\n■決済リンク\n{{paymentLink}}\n\n※決済完了後、通常7営業日以内に発送いたします。\n※本リンクの有効期限は発行から3日間となっております。\n\nお早めのお手続きをお願い申し上げます。`
  },
  {
    id: 'sys_application_rejected',
    name: '[システム] 審査却下通知',
    subject: '【ChronoRent】レンタル申込に関するお知らせ',
    type: 'application',
    body: `{{userName}} 様\n\nこの度はTimeWaverレンタルにお申し込みいただき、誠にありがとうございました。\n\nお申し込み内容を慎重に検討させていただきました結果、誠に残念ながら今回はご利用を見送らせていただくこととなりました。\n\nご希望に沿えず誠に恐縮ですが、何卒ご了承くださいますようお願い申し上げます。\nなお、個別の審査理由については開示いたしておりませんので、あらかじめご了承ください。\n\nまたのご利用をお待ちしております。`
  },
  {
    id: 'sys_payment_completed',
    name: '[システム] 決済完了・配送案内',
    subject: '【ChronoRent】決済完了および配送のお知らせ',
    type: 'transaction',
    body: `{{userName}} 様\n\n決済のお手続きをいただきありがとうございました。\nお支払いの確認が取れましたので、デバイスの発送準備を開始いたしました。\n\n対象機器: {{deviceName}}\nシリアル番号: {{serialNumber}}\n\n発送が完了しましたら、改めてお荷物伝票番号を添えてご連絡させていただきます。\n\nデバイス到着後、すぐに操作を開始いただけるよう「操作ガイド」を同梱しております。\nTimeWaverとの新しいライフスタイルをぜひお楽しみください。`
  },
  {
    id: 'sys_waitlist_available',
    name: '[システム] キャンセル待ち在庫確保',
    subject: '【ChronoRent】ご希望の機器に空きが出ました',
    type: 'waiting',
    body: `{{userName}} 様\n\nお待たせいたしました！\nキャンセル待ち登録をいただいておりました以下の機器に、本日在庫の空きが発生いたしました。\n\n対象機器: {{deviceName}}\n\n現在、優先的にご案内しております。\nレンタルをご希望の場合は、お早めに以下のリンクよりお申し込み手続きをお願いいたします。\n\n※本メール送信から24時間が経過しますと、次の方へ優先権が移動しますのでご注意ください。\n\nお申し込みはこちらから:\n[サイトのURL]`
  }
];
