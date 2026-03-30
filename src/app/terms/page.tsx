
'use client';

import { useServiceName } from '@/hooks/use-service-name';

export default function TermsPage() {
  const serviceName = useServiceName();
  return (
    <div className="container mx-auto px-4 py-20 max-w-4xl space-y-8">
      <h1 className="text-4xl font-bold font-headline mb-12">利用規約</h1>
      
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">第1条（適用）</h2>
        <p className="text-muted-foreground leading-relaxed">
          本規約は、{serviceName}（以下、「当社」）が提供するTimeWaverレンタルサービス（以下、「本サービス」）の利用条件を定めるものです。本サービスを利用する全てのユーザーに適用されます。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">第2条（利用登録）</h2>
        <p className="text-muted-foreground leading-relaxed">
          本サービスの利用を希望する者は、本規約に同意の上、当社の定める方法によって利用登録を申請するものとします。当社がこれを承認することによって利用登録が完了します。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">第3条（レンタル契約と審査）</h2>
        <p className="text-muted-foreground leading-relaxed">
          レンタル申し込み後、当社所定の審査を行います。審査の結果、利用をお断りする場合がありますが、その理由については一切開示いたしません。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">第4条（禁止事項）</h2>
        <ul className="list-disc list-inside text-muted-foreground space-y-2">
          <li>機器の転売、譲渡、質入れ、また第三者への貸与。</li>
          <li>機器の分解、改造、リバースエンジニアリング。</li>
          <li>法令または公序良俗に違反する行為。</li>
          <li>当社のサービスの運営を妨害する恐れのある行為。</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">第5条（損害賠償）</h2>
        <p className="text-muted-foreground leading-relaxed">
          ユーザーが機器を紛失、破損、または汚損させた場合、当社はユーザーに対し、修理費用または同等品の購入費用を請求できるものとします。
        </p>
      </section>

      <div className="pt-12 text-sm text-muted-foreground">
        最終更新日：2024年3月11日
      </div>
    </div>
  );
}
