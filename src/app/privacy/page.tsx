
'use client';

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-20 max-w-4xl space-y-8">
      <h1 className="text-4xl font-bold font-headline mb-12">プライバシーポリシー</h1>
      
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">1. 個人情報の収集</h2>
        <p className="text-muted-foreground leading-relaxed">
          当社は、サービスの提供にあたり、氏名、メールアドレス、電話番号、住所、本人確認書類の画像等の個人情報を適法かつ公正な手段によって収集します。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">2. 利用目的</h2>
        <p className="text-muted-foreground leading-relaxed">
          収集した個人情報は、以下の目的で利用します。
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-2">
          <li>本サービスの提供・運営のため</li>
          <li>本人確認および審査のため</li>
          <li>機器の発送および返却管理のため</li>
          <li>お問い合わせへの対応のため</li>
          <li>重要なお知らせやメンテナンス情報の通知のため</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">3. 第三者への提供</h2>
        <p className="text-muted-foreground leading-relaxed">
          当社は、法令に基づく場合を除き、あらかじめ本人の同意を得ることなく個人情報を第三者に提供することはありません。ただし、配送業者等の委託先についてはこの限りではありません。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">4. 安全管理措置</h2>
        <p className="text-muted-foreground leading-relaxed">
          当社は、取り扱う個人情報の漏えい、滅失またはき損の防止その他の個人情報の安全管理のために必要かつ適切な措置を講じます。
        </p>
      </section>

      <div className="pt-12 text-sm text-muted-foreground">
        最終更新日：2024年3月11日
      </div>
    </div>
  );
}
