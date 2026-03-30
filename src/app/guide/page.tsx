'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ChevronRight, UserPlus, Search, ClipboardList, FileText, CreditCard, Truck, Activity, RotateCcw } from 'lucide-react';

const STEPS = [
  {
    title: "会員登録",
    description: "メールアドレスでアカウントを作成してください。数分で完了します。",
    status: "— 登録後すぐにご利用開始できます",
    icon: UserPlus,
    color: "bg-blue-500",
  },
  {
    title: "機器の選択",
    description: "用途やご予算に合わせて、4種類のTimeWaverから最適な一台をお選びください。",
    status: "— 機器ラインナップはいつでも確認できます",
    icon: Search,
    color: "bg-indigo-500",
  },
  {
    title: "レンタル申し込み・審査",
    description: "申し込みフォームに必要事項を入力し、本人確認書類をアップロードして送信します。内容を確認後、通常1〜3営業日以内に審査結果をお知らせします。",
    status: "ステータス: 申込受付 → 審査中",
    icon: ClipboardList,
    color: "bg-purple-500",
  },
  {
    title: "同意書の提出・確認",
    description: "審査承認後、マイページから同意書をダウンロードし、署名・捺印の上アップロードしてください。提出後、管理者が内容を確認します。",
    status: "ステータス: 同意書提出待ち → 同意書確認中",
    icon: FileText,
    color: "bg-violet-500",
  },
  {
    title: "決済",
    description: "同意書の承認後、決済リンクをメールにてお送りします。初回月額料金のお支払い手続きをお願いします。",
    status: "ステータス: 決済案内済み",
    icon: CreditCard,
    color: "bg-pink-500",
  },
  {
    title: "発送・受取",
    description: "決済完了後、機器の発送準備を開始します。通常2〜3営業日でお手元に届きます。追跡番号は別途ご連絡します。",
    status: "ステータス: 発送準備中 → 発送済み",
    icon: Truck,
    color: "bg-cyan-500",
  },
  {
    title: "ご利用",
    description: "機器が届いたら、同梱のスタートガイドに沿ってセットアップしてください。ご不明な点はAIサポートまたはサポート窓口へお問い合わせください。",
    status: "ステータス: 利用中",
    icon: Activity,
    color: "bg-emerald-500",
  },
  {
    title: "返却",
    description: "契約期間終了またはご解約の際は、同梱の返送ガイドに従い着払いで機器をご返送ください。点検完了後、正式に契約終了となります。",
    status: "ステータス: 返却中 → 点検中 → 完了",
    icon: RotateCcw,
    color: "bg-slate-500",
  },
];

export default function GuidePage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-5xl">
      <div className="text-center mb-16 space-y-4">
        <h1 className="font-headline text-4xl font-bold tracking-tight sm:text-5xl">ご利用の流れ</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          申し込みから返却まで、8つのステップでTimeWaverレンタルの全体像をご案内します。
        </p>
      </div>

      <div className="relative space-y-10">
        {/* Connection Line (Desktop) */}
        <div className="absolute left-[50px] top-12 bottom-12 w-0.5 bg-gradient-to-b from-primary/20 via-primary to-primary/20 hidden md:block" />

        {STEPS.map((step, index) => (
          <div
            key={index}
            className="flex flex-col md:flex-row items-start gap-8 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className={`h-[100px] w-[100px] rounded-3xl ${step.color} text-white flex items-center justify-center shadow-2xl shrink-0`}>
              <step.icon className="h-10 w-10" />
            </div>
            <Card className="flex-1 border-none shadow-xl bg-white rounded-3xl">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary tracking-widest uppercase">
                    Step {String(index + 1).padStart(2, '0')}
                  </span>
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 opacity-20" />
                </div>
                <CardTitle className="font-headline text-2xl">{step.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-muted-foreground leading-relaxed text-base">
                  {step.description}
                </p>
                <Badge variant="secondary" className="text-[11px] text-muted-foreground bg-muted/60 font-normal">
                  {step.status}
                </Badge>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      <div className="mt-20 p-12 bg-primary rounded-[3rem] text-white text-center shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 h-64 w-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-48 w-48 bg-accent/20 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />

        <div className="relative z-10 space-y-8">
          <h2 className="font-headline text-3xl md:text-5xl font-bold">準備はよろしいですか？</h2>
          <p className="text-primary-foreground/80 text-lg max-w-xl mx-auto">
            まずは現在レンタル可能な機器のラインナップをご確認ください。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/devices">
              <Button size="lg" className="bg-white text-primary hover:bg-white/90 font-bold h-14 px-10 rounded-2xl shadow-xl">
                機器一覧を見る <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/auth/register">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 font-bold h-14 px-10 rounded-2xl">
                無料会員登録
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
