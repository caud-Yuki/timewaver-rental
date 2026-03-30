
/**
 * @fileOverview System default email templates.
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
    subject: '【{{serviceName}}】会員登録が完了しました',
    type: 'general',
    body: `{{userName}} 様\n\n{{serviceName}}への会員登録ありがとうございます。\n\n当プラットフォームでは、TimeWaverをより身近に、手軽にご利用いただけるレンタルサービスを提供しております。\n\nまずは「機器一覧」より、あなたに最適な一台をお探しください。`
  },
  {
    id: 'sys_application_submitted',
    name: '[標準] 申込受付完了',
    subject: '【{{serviceName}}】レンタル申込を受付いたしました',
    type: 'application',
    body: `{{userName}} 様\n\nTimeWaverのレンタルお申し込みをいただき、ありがとうございます。\n\n対象機器: {{deviceName}}\n現在、管理者にて審査を行っております。\n通常1〜3営業日以内に、結果をご案内させていただきます。`
  },
  {
    id: 'sys_consent_form_required',
    name: '[標準] 審査承認・同意書提出のお願い',
    subject: '【{{serviceName}}】審査承認および同意書のご提出について',
    type: 'application',
    body: `{{userName}} 様\n\nお申し込みいただいたTimeWaverのレンタル審査が承認されました。\n契約を完了するには、同意書の提出が必要です。\n\nマイページへログインし、「申請履歴」から同意書をダウンロード・署名の上、アップロードしてください。\n\nご提出いただいた同意書を管理者が確認次第、決済手続きのご案内をお送りします。`
  },
  {
    id: 'sys_consent_form_submitted',
    name: '[標準] 同意書提出のお知らせ（管理者宛）',
    subject: '【{{serviceName}}管理者】同意書の提出がありました',
    type: 'application',
    body: `管理者様\n\n以下の申請について、ユーザーから同意書の提出がありました。\n内容を確認し、承認処理を行ってください。\n\nユーザー名: {{userName}}\n申請ID: {{applicationId}}`
  },
  {
    id: 'sys_application_approved',
    name: '[標準] 審査承認・決済案内',
    subject: '【{{serviceName}}】同意書承認および決済のご案内',
    type: 'application',
    body: `{{userName}} 様\n\nご提出いただいた同意書を確認し、承認いたしました。\n以下のリンクより決済のお手続きをお願いいたします。\n\n■決済リンク\n{{paymentLink}}`
  },
  {
    id: 'sys_application_rejected',
    name: '[標準] 審査却下通知',
    subject: '【{{serviceName}}】レンタル申込に関するお知らせ',
    type: 'application',
    body: `{{userName}} 様\n\n今回は誠に残念ながら、ご利用を見送らせていただくこととなりました。\nご了承くださいますようお願い申し上げます。`
  },
  {
    id: 'sys_payment_completed',
    name: '[標準] 決済完了通知',
    subject: '【{{serviceName}}】決済完了および配送のお知らせ',
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
    subject: '【{{serviceName}}】レンタル契約終了のお知らせ',
    type: 'transaction',
    body: `{{userName}} 様\n\n本日をもちましてTimeWaverのレンタル契約が終了いたしました。\n機器の返却手順につきましては、同梱のガイドをご確認ください。`
  },
  {
    id: 'sys_news_published',
    name: '[標準] ニュース公開通知',
    subject: '【{{serviceName}}】新しいお知らせがあります',
    type: 'news',
    body: `{{userName}} 様\n\n{{serviceName}}より新しいニュースが公開されました。\n詳細は以下のリンクよりご確認ください。`
  },
  {
    id: 'sys_waitlist_available',
    name: '[標準] 在庫確保通知',
    subject: '【{{serviceName}}】ご希望の機器に空きが出ました',
    type: 'waiting',
    body: `{{userName}} 様\n\nキャンセル待ち登録をいただいておりました機器に空きが発生いたしました。\nお早めにお申し込み手続きをお願いいたします。`
  },
  {
    id: 'sys_consent_form_submitted',
    name: '[標準] 同意書提出通知（管理者宛）',
    subject: '【{{serviceName}}管理者】同意書の提出がありました',
    type: 'application',
    body: `管理者様\n\n以下の申請について、ユーザーから同意書の提出がありました。\n内容を確認し、承認処理を行ってください。\n\nユーザー名: {{userName}}\n申請ID: {{applicationId}}`
  },
  {
    id: 'sys_consent_form_approved',
    name: '[標準] 同意書承認・決済案内',
    subject: '【{{serviceName}}】同意書承認および決済のご案内',
    type: 'application',
    body: `{{userName}} 様\n\nご提出いただいた同意書を確認し、承認いたしました。\n以下のリンクより決済のお手続きをお願いいたします。\n\n■決済リンク\n{{paymentLink}}`
  },
  {
    id: 'sys_device_prep_required',
    name: '[標準] 発送準備依頼（スタッフ宛）',
    subject: '【{{serviceName}}管理者】発送準備のお願い',
    type: 'application',
    body: `スタッフ各位\n\n以下のデバイスの発送準備をお願いいたします。\n\n■対象デバイス\n{{deviceType}}\n\n■配送先ユーザー\n{{userName}}\n\n■配送先住所\n{{shippingAddress}}\n\n■到着期限\n{{deadline}}\n（上記日付までにユーザーの手元に届くよう発送してください）\n\n管理画面の申請管理より発送処理を完了してください。`
  },
  {
    id: 'sys_device_shipped',
    name: '[標準] 発送通知',
    subject: '【{{serviceName}}】デバイスを発送いたしました',
    type: 'application',
    body: `{{userName}} 様\n\nお申し込みいただいたデバイスを発送いたしました。\n\n対象機器: {{deviceType}}\n\nお届けまで通常2〜3営業日ほどお時間をいただいております。\n届きましたら、同梱のスタートガイドに沿ってセットアップをお願いいたします。\n\n何かご不明な点がございましたら、お気軽にお問い合わせください。`
  },
  {
    id: 'sys_contract_renewal_reminder',
    name: '[標準] 契約終了1ヶ月前通知',
    subject: '【{{serviceName}}】契約終了まであと1ヶ月です — 更新のご案内',
    type: 'transaction',
    body: `{{userName}} 様\n\nいつも{{serviceName}}をご利用いただきありがとうございます。\n\nご利用中の「{{deviceType}}」のレンタル契約が {{endDate}} に終了予定です。\n\n引き続きご利用をご希望の場合は、マイページの「マイデバイス」から「契約更新」ボタンよりお手続きいただけます。\n\n▼ マイデバイスページ\nhttps://studio--studio-3681859885-cd9c1.us-central1.hosted.app/mypage/devices\n\n更新手続きは契約終了日の1ヶ月前から可能です。\n更新されない場合、契約終了日をもって自動的にサービスが終了し、機器の返却をお願いすることになります。\n\nご不明な点がございましたら、お気軽にお問い合わせください。\n\n{{serviceName}} 運営事務局`
  },
  {
    id: 'sys_subscription_canceled',
    name: '[標準] 解約通知',
    subject: '【{{serviceName}}】サブスクリプション解約のお知らせ',
    type: 'transaction',
    body: `{{userName}} 様\n\nご利用いただいておりましたTimeWaverのレンタルサブスクリプションが解約されました。\n\n対象機器: {{deviceType}}\n\n機器の返却手続きについては、別途ご案内をお送りいたします。\nご利用いただきありがとうございました。`
  },
  {
    id: 'sys_device_return_guide',
    name: '[標準] 返却案内',
    subject: '【{{serviceName}}】機器の返却手続きについて',
    type: 'transaction',
    body: `{{userName}} 様\n\nレンタル契約の終了に伴い、機器の返却をお願いいたします。\n\n対象機器: {{deviceType}}\n\n■ 返却手順\n1. 同梱されていた箱に機器を梱包してください\n2. 付属品（ケーブル、アダプター等）も忘れずにお入れください\n3. 着払いにてご返送ください\n\n■ 返送先\n〒XXX-XXXX 東京都XXX区XXX X-X-X\n{{serviceName}} 返却受付係\n\n返却期限: お届けから7日以内\n\nご不明な点がございましたら、お気軽にお問い合わせください。`
  },
  {
    id: 'sys_device_inspection',
    name: '[標準] 点検依頼（スタッフ宛）',
    subject: '【{{serviceName}}内部】デバイス点検依頼',
    type: 'general',
    body: `スタッフ各位\n\n以下のデバイスが返却されました。点検をお願いいたします。\n\n対象機器: {{deviceType}}\nユーザー名: {{userName}}\n申請ID: {{applicationId}}\n\n点検完了後、問題がなければ申請管理画面から「返却完了」に、\n破損・不具合がある場合は「破損・不具合あり」にステータスを変更してください。`
  },
  {
    id: 'sys_device_returned',
    name: '[標準] 返却完了通知',
    subject: '【{{serviceName}}】機器の返却を確認いたしました',
    type: 'transaction',
    body: `{{userName}} 様\n\n機器の返却および点検が完了いたしました。問題はございませんでした。\n\n対象機器: {{deviceType}}\n\nご利用いただきありがとうございました。\nまたのご利用を心よりお待ちしております。\n\n{{serviceName}} 運営事務局`
  },
  {
    id: 'sys_device_damaged',
    name: '[標準] 破損・不具合通知',
    subject: '【{{serviceName}}】返却機器の点検結果について',
    type: 'transaction',
    body: `{{userName}} 様\n\nご返却いただいたデバイスを点検した結果、破損・不具合が確認されました。\n\n対象機器: {{deviceType}}\n\n契約時にお預かりしたデポジットより、修理・交換費用を充当させていただきます。\n費用の詳細につきましては、別途ご連絡いたします。\n\nご不明な点がございましたら、お気軽にお問い合わせください。\n\n{{serviceName}} 運営事務局`
  }
];
