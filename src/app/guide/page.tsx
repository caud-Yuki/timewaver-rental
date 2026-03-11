'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ChevronRight, UserPlus, Search, ClipboardCheck, Package } from 'lucide-react';

const STEPS = [
  {
    title: "会員登録",
    description: "まずはメールアドレスでアカウントを作成してください。数分で完了します。",
    icon: UserPlus,
    color: "bg-blue-500"
  },
  {
    title: "機器の選択",
    description: "用途やご予算に合わせて、4種類のTimeWaverから最適なものをお選びください。",
    icon: Search,
    color: "bg-indigo-500"
  },
  {
    title: "利用申し込み・審査",
    description: "本人確認書類をアップロードし、審査を依頼します。通常1〜3営業日で完了します。",
    icon: ClipboardCheck,
    color: "bg-purple-500"
  },
  {
    title: "配送・利用開始",
    description: "決済完了後、機器を発送します。到着したその日からTimeWaverライフのスタートです。",
    icon: Package,
    color: "bg-emerald-500"
  }
];

export default function GuidePage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-5xl">
      <div className="text-center mb-16 space-y-4">
        <h1 className="font-headline text-4xl font-bold tracking-tight sm:text-5xl">ご利用の流れ</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          TimeWaverを体験していただくための、シンプルな4つのステップをご案内します。
        </p>
      </div>

      <div className="relative space-y-12">
        {/* Connection Line (Desktop) */}
        <div className="absolute left-[50px] top-12 bottom-12 w-0.5 bg-gradient-to-b from-primary/20 via-primary to-primary/20 hidden md:block" />

        {STEPS.map((step, index) => (
          <div key={index} className="flex flex-col md:flex-row items-start gap-8 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700" style={{ animationDelay: `${index * 150}ms` }}>
            <div className={`h-[100px] w-[100px] rounded-3xl ${step.color} text-white flex items-center justify-center shadow-2xl shrink-0`}>
              <step.icon className="h-10 w-10" />
            </div>
            <Card className="flex-1 border-none shadow-xl bg-white rounded-3xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary tracking-widest uppercase">Step 0{index + 1}</span>
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 opacity-20" />
                </div>
                <CardTitle className="font-headline text-2xl">{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed text-lg">
                  {step.description}
                </p>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      <div className="mt-20 p-12 bg-primary rounded-[3rem] text-white text-center shadow-2xl overflow-hidden relative">
        {/* Background Decals */}
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
