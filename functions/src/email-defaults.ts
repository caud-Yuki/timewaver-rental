
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
  /** When true, the email is wrapped in the admin/staff design (gray header). */
  isAdmin?: boolean;
  /** Optional Google Chat-specific title; falls back to the email subject. */
  chatSubject?: string;
  /** Optional Google Chat-specific body; falls back to the stripped email body. */
  chatBody?: string;
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
    isAdmin: true,
    body: `管理者様\n\n以下の申請について、ユーザーから同意書の提出がありました。\n内容を確認し、承認処理を行ってください。\n\nユーザー名: {{userName}}\n申請ID: {{applicationId}}`
  },
  {
    id: 'sys_application_approved',
    name: '[標準] 審査承認・決済案内',
    subject: '【{{serviceName}}】同意書承認および決済のご案内',
    type: 'application',
    body: `{{userName}} 様\n\nご提出いただいた同意書を確認し、承認いたしました。\n決済のご案内は、準備が整い次第あらためて別途お送りいたしますので、今しばらくお待ちください。\n\nご不明な点がございましたら、本メールへご返信ください。\n\n—\n{{operatorCompanyName}}`
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
    body: `{{userName}} 様\n\n決済のお手続きありがとうございました。\nデバイスの発送準備を開始いたしました。\n\n対象機器: {{deviceType}}\nシリアル番号: {{deviceSerialNumber}}`
  },
  {
    id: 'sys_bank_transfer_instructions',
    name: '[標準] 銀行振込のご案内',
    subject: '【{{serviceName}}】お振込先のご案内（一括払い）',
    type: 'transaction',
    body: `{{userName}} 様\n\nこの度はお申し込みいただきありがとうございます。\nお支払い方法に「銀行振込（一括払い）」をご選択いただきましたので、下記の通りお振込先をご案内いたします。\n\n■ご請求金額: ¥{{transferAmount}}\n■お振込期限: {{transferDeadline}}\n■対象機器: {{deviceType}}\n\n──────────────────\n【お振込先】\n金融機関: {{bankName}} {{bankBranch}}\n預金種別: {{bankAccountType}}\n口座番号: {{bankAccountNumber}}\n口座名義: {{bankAccountHolder}}\n──────────────────\n\n【お振込時のお願い】\n・お振込名義の前に申請番号（{{applicationId}}）をご入力ください（例: {{applicationId}} ヤマダタロウ）。入金確認がスムーズになります。\n・振込手数料はお客様のご負担にてお願いいたします。\n{{bankTransferNote}}\n\nご入金を確認次第、あらためて決済完了のご連絡と発送のご案内をお送りいたします。\nお振込期限までにご入金が確認できない場合、お申し込みが無効となる場合がございますのでご了承ください。\n\nご不明な点がございましたら、本メールへご返信ください。\n\n—\n{{operatorCompanyName}}`
  },
  {
    id: 'sys_bank_transfer_pending_admin',
    name: '[標準] 銀行振込案内 送付通知（管理者宛）',
    subject: '【{{serviceName}}管理者】銀行振込の案内を送付しました（入金確認待ち）',
    type: 'transaction',
    isAdmin: true,
    body: `管理者様\n\n以下の申請について、銀行振込のご案内をユーザーへ送付しました。\n入金の確認後、申請管理画面の「入金確認」ボタンでステータスを更新してください。\n\n申請ID: {{applicationId}}\nユーザー名: {{userName}}\n対象機器: {{deviceType}}\n請求金額: ¥{{transferAmount}}\n振込期限: {{transferDeadline}}`
  },
  {
    id: 'sys_payment_failed',
    name: '[標準] 決済失敗通知（管理者宛）',
    subject: '【{{serviceName}}管理者】月次決済が失敗しました',
    type: 'transaction',
    isAdmin: true,
    body: `管理者様\n\n以下のサブスクリプションで月次決済が失敗しました。\n\nサブスクリプションID: {{subscriptionId}}\n対象機器: {{deviceType}}\n失敗金額: ¥{{amount}}\n失敗回数: {{failureCount}}回\n失敗理由: {{declineCode}}\n\n14日以内に復旧されない場合、自動的にキャンセル処理されます。`
  },
  {
    id: 'sys_payment_failed_user',
    name: '[標準] 決済失敗通知（ユーザー宛）',
    subject: '【重要】月次決済の処理に失敗しました — カード情報のご確認をお願いします',
    type: 'transaction',
    body: `{{userName}} 様\n\nいつも{{serviceName}}をご利用いただきありがとうございます。\n\n本日、月次決済の処理に失敗いたしました。\n\n■対象機器: {{deviceType}}\n■決済予定額: ¥{{amount}}\n■失敗回数: {{failureCount}}回目\n■次回自動リトライ予定: {{nextAttemptAt}}\n\nカードの有効期限切れ、利用限度額超過、ご利用停止などが原因として考えられます。\n以下のリンクより、お支払い情報をご確認・更新ください。\n\n▼ お支払い情報を更新する\n{{cardUpdateUrl}}\n\n14日以内にご対応いただけない場合、ご契約は自動的にキャンセルとなり、機器のご返却をお願いすることになります。\n\nご不明な点がございましたら、お気軽にお問い合わせください。\n\n{{serviceName}} 運営事務局`
  },
  {
    id: 'sys_card_expiring',
    name: '[標準] カード期限切れ予告（ユーザー宛）',
    subject: '【{{serviceName}}】登録カードの有効期限が近づいています',
    type: 'transaction',
    body: `{{userName}} 様\n\nいつも{{serviceName}}をご利用いただきありがとうございます。\n\nお客様のサブスクリプションでご登録いただいているクレジットカードの有効期限が、まもなく切れます。\n\n■カード末尾: ****{{last4}}\n■有効期限: {{expMonth}}/{{expYear}}\n■対象機器: {{deviceType}}\n\n期限切れにより自動決済が失敗するのを防ぐため、新しいカード情報のご登録をお願いいたします。\n\n▼ カード情報を更新する\n{{cardUpdateUrl}}\n\nご不明な点がございましたら、お気軽にお問い合わせください。\n\n{{serviceName}} 運営事務局`
  },
  {
    id: 'sys_initial_payment_failed',
    name: '[標準] 初回決済失敗通知（管理者宛）',
    subject: '【{{serviceName}}管理者】初回決済が失敗しました',
    type: 'transaction',
    isAdmin: true,
    body: `管理者様\n\n以下のpaymentLinkで初回決済が失敗しました。ユーザーが決済を諦めた可能性があるため、フォローアップをご検討ください。\n\npaymentLinkID: {{paymentLinkId}}\nユーザーID: {{userId}}\n金額: ¥{{amount}}\nDeclineコード: {{declineCode}}\nエラーメッセージ: {{failureMessage}}`
  },
  {
    id: 'sys_subscription_canceled_payment_failure',
    name: '[標準] 決済失敗による自動解約通知（ユーザー宛）',
    subject: '【{{serviceName}}】月次決済の継続失敗によりご契約をキャンセルいたしました',
    type: 'transaction',
    body: `{{userName}} 様\n\n{{firstFailedAt}} より{{graceDays}}日間にわたり、月次決済の処理に失敗し続けたため、誠に残念ながらご契約を自動的にキャンセルさせていただきました。\n\n■対象機器: {{deviceType}}\n\n機器の返却手続きについて、追ってご案内いたします。\n再度ご利用をご希望の場合は、新規お申し込みより手続きをお願いいたします。\n\nご不明な点がございましたら、お気軽にお問い合わせください。\n\n{{serviceName}} 運営事務局`
  },
  {
    id: 'sys_subscription_canceled_payment_failure_admin',
    name: '[標準] 決済失敗による自動解約通知（管理者宛）',
    subject: '【{{serviceName}}管理者】サブスクが決済失敗により自動解約されました',
    type: 'transaction',
    isAdmin: true,
    body: `管理者様\n\n以下のサブスクリプションが、決済失敗の14日経過により自動キャンセルされました。\n\nサブスクリプションID: {{subscriptionId}}\nユーザーID: {{userId}}\n対象機器: {{deviceType}}\n初回失敗日: {{firstFailedAt}}\n\n機器の回収手続きをご手配ください。`
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
    isAdmin: true,
    body: `管理者様\n\n以下の申請について、ユーザーから同意書の提出がありました。\n内容を確認し、承認処理を行ってください。\n\nユーザー名: {{userName}}\n申請ID: {{applicationId}}`
  },
  {
    id: 'sys_consent_form_approved',
    name: '[標準] 同意書承認・決済案内',
    subject: '【{{serviceName}}】同意書承認および決済のご案内',
    type: 'application',
    body: `{{userName}} 様\n\nご提出いただいた同意書を確認し、承認いたしました。\n決済のご案内は、準備が整い次第あらためて別途お送りいたしますので、今しばらくお待ちください。\n\nご不明な点がございましたら、本メールへご返信ください。\n\n—\n{{operatorCompanyName}}`
  },
  {
    id: 'sys_device_prep_required',
    name: '[標準] 発送準備依頼（スタッフ宛）',
    subject: '【{{serviceName}}管理者】発送準備のお願い',
    type: 'application',
    isAdmin: true,
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
    isAdmin: true,
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
  },
  {
    id: 'sys_early_booking_confirmation',
    name: '[標準] 先行予約受付完了',
    subject: '【{{serviceName}}】先行予約を受け付けました',
    type: 'general',
    body: `{{userName}} 様\n\nこの度は {{serviceName}} の先行予約にご登録いただき、誠にありがとうございます。\n\n下記の内容で予約を受け付けましたのでご確認ください。\n\n━━━━━━━━━━━━━━━━━━━━\nお名前: {{userName}}\n会社名・屋号: {{companyName}}\nメールアドレス: {{userEmail}}\n電話番号: {{phone}}\nご興味のある機器: {{desiredDevice}}\nご質問・ご要望:\n{{message}}\n━━━━━━━━━━━━━━━━━━━━\n\n正式ローンチ時には、優先的にご案内差し上げます。\nご質問等ございましたら、このメールへ直接ご返信ください。\n\n改めまして、ご登録ありがとうございました。\n今後ともどうぞよろしくお願いいたします。\n\n—\n{{operatorCompanyName}}`
  },
  {
    id: 'sys_early_booking_admin_notification',
    name: '[標準] 先行予約通知（管理者宛）',
    subject: '【{{serviceName}}管理者】新規先行予約がありました — {{userName}} 様',
    type: 'general',
    isAdmin: true,
    body: `管理者様\n\n新しい先行予約が登録されました。\n\n━━━━━━━━━━━━━━━━━━━━\nお名前: {{userName}}\n会社名・屋号: {{companyName}}\nメールアドレス: {{userEmail}}\n電話番号: {{phone}}\nご興味のある機器: {{desiredDevice}}\nご質問・ご要望:\n{{message}}\n登録日時: {{submittedAt}}\n━━━━━━━━━━━━━━━━━━━━\n\n管理画面で詳細を確認してください:\n{{linkAdminEarlyBookings}}`
  },
  {
    id: 'sys_early_booking_launch_notice',
    name: '[標準] 先行予約者へのローンチ案内',
    subject: '【{{serviceName}}】お申し込み受付を開始しました — 先行予約のご案内',
    type: 'general',
    body: `{{userName}} 様\n\nお待たせいたしました。\nこの度、{{serviceName}} の正式なお申し込み受付を開始いたしました。\n\n先行予約にご登録いただいた皆さまへ、優先的にご案内を差し上げております。\n下記より、ご希望の機器のお申し込み手続きにお進みください。\n\n▼ 機器一覧・お申し込みはこちら\n{{linkDeviceList}}\n\nご不明な点がございましたら、このメールへ直接ご返信ください。\n\n改めまして、先行予約にご登録いただき誠にありがとうございました。\n今後ともどうぞよろしくお願いいたします。\n\n—\n{{operatorCompanyName}}`
  },
  // --- Admin/staff notifications (added for events that previously had no admin template) ---
  {
    id: 'sys_application_submitted_admin',
    name: '[標準] 新規申込通知（管理者宛）',
    subject: '【{{serviceName}}管理者】新規レンタル申込が届きました',
    type: 'application',
    isAdmin: true,
    body: `管理者様\n\n新しいレンタル申込が届きました。内容をご確認のうえ、審査・承認処理を行ってください。\n\n■申込者\n{{userName}}（{{userEmail}}）\n\n■申請ID\n{{applicationId}}\n\n■対象機器\n{{deviceType}}\n\n管理画面の申請管理より審査を進めてください。`,
    chatSubject: '【新規申込】{{serviceName}}',
    chatBody: `申込者: {{userName}}\n申請ID: {{applicationId}}\n対象機器: {{deviceType}}\n→ 管理画面の申請管理より審査してください`
  },
  {
    id: 'sys_device_damaged_admin',
    name: '[標準] 破損・不具合通知（管理者宛）',
    subject: '【{{serviceName}}管理者】返却機器に破損・不具合が確認されました',
    type: 'transaction',
    isAdmin: true,
    body: `管理者様\n\n点検の結果、返却された機器に破損・不具合が確認されました。\n損害賠償・代替機の手配など、対応方針をご判断ください。\n\n■対象機器\n{{deviceType}}\n\n■シリアル番号\n{{deviceSerialNumber}}\n\n■利用者\n{{userName}}（{{userEmail}}）\n\n■申請ID\n{{applicationId}}\n\n管理画面の申請管理より詳細をご確認ください。`,
    chatSubject: '【破損・不具合】{{serviceName}}',
    chatBody: `対象機器: {{deviceType}}（{{deviceSerialNumber}}）\n利用者: {{userName}}\n申請ID: {{applicationId}}\n→ 賠償・代替機手配の判断が必要です`
  },
  {
    id: 'sys_contract_renewal_reminder_admin',
    name: '[標準] 契約終了1ヶ月前通知（スタッフ宛）',
    subject: '【{{serviceName}}管理者】契約終了1ヶ月前のお知らせ',
    type: 'transaction',
    isAdmin: true,
    body: `スタッフ各位\n\n以下の契約が約1ヶ月後に終了します。更新案内のフォローや返却受け入れの準備をお願いいたします。\n\n■利用者\n{{userName}}（{{userEmail}}）\n\n■対象機器\n{{deviceType}}\n\n■契約終了日\n{{endDate}}`,
    chatSubject: '【契約終了1ヶ月前】{{serviceName}}',
    chatBody: `利用者: {{userName}}\n対象機器: {{deviceType}}\n契約終了日: {{endDate}}\n→ 更新フォロー / 返却受け入れ準備を`
  },
  {
    id: 'sys_contract_expired_admin',
    name: '[標準] 契約終了通知（スタッフ宛）',
    subject: '【{{serviceName}}管理者】契約が終了しました',
    type: 'transaction',
    isAdmin: true,
    body: `スタッフ各位\n\n以下の契約が終了しました。返却対応の進捗をご確認ください。\n\n■利用者\n{{userName}}（{{userEmail}}）\n\n■対象機器\n{{deviceType}}\n\n■申請ID\n{{applicationId}}\n\n返却が完了するまで管理画面でステータスを追跡してください。`,
    chatSubject: '【契約終了】{{serviceName}}',
    chatBody: `利用者: {{userName}}\n対象機器: {{deviceType}}\n申請ID: {{applicationId}}\n→ 返却対応の追跡をお願いします`
  },
  {
    id: 'sys_device_return_guide_admin',
    name: '[標準] 返却案内通知（スタッフ宛）',
    subject: '【{{serviceName}}管理者】返却案内を送付しました（受け入れ準備）',
    type: 'transaction',
    isAdmin: true,
    body: `スタッフ各位\n\n以下の利用者へ返却案内を送付しました。機器の返却受け入れと点検の準備をお願いいたします。\n\n■利用者\n{{userName}}（{{userEmail}}）\n\n■対象機器\n{{deviceType}}\n\n■申請ID\n{{applicationId}}\n\n機器到着後、点検を実施してください。`,
    chatSubject: '【返却案内】{{serviceName}}',
    chatBody: `利用者: {{userName}}\n対象機器: {{deviceType}}\n申請ID: {{applicationId}}\n→ 返却受け入れ・点検の準備を`
  },
  {
    id: 'sys_waitlist_available_admin',
    name: '[標準] 在庫確保通知（スタッフ宛）',
    subject: '【{{serviceName}}管理者】キャンセル待ちへ在庫を確保しました',
    type: 'waiting',
    isAdmin: true,
    body: `スタッフ各位\n\nキャンセル待ち対象の機器に空きが出たため、登録ユーザーへ在庫確保の通知を送信しました。\n申込・決済の進捗にあわせて在庫の引き当て状況をご確認ください。\n\n■対象機器\n{{deviceType}}\n\n■通知送信数\n{{notifiedCount}}件`,
    chatSubject: '【在庫確保】{{serviceName}}',
    chatBody: `対象機器: {{deviceType}}\n通知送信: {{notifiedCount}}件\n→ 在庫引き当て状況をご確認ください`
  }
];
