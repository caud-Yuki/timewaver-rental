'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Loader2, ShieldAlert, Layers, MessageCircle, HelpCircle, Briefcase, ArrowUpRight
} from 'lucide-react';
import { UserProfile } from '@/types';

const landingModules = [
  {
    title: '利用者の声',
    desc: 'お客様のコメント・肩書き・動画埋め込みを管理',
    icon: MessageCircle,
    href: '/admin/testimonials',
    color: 'text-pink-500',
    bg: 'bg-pink-50',
  },
  {
    title: 'FAQ',
    desc: 'よくある質問の追加・編集・公開/非公開切替',
    icon: HelpCircle,
    href: '/admin/faqs',
    color: 'text-cyan-500',
    bg: 'bg-cyan-50',
  },
  {
    title: '導入事例',
    desc: 'ケーススタディの追加・編集・業種タグ管理',
    icon: Briefcase,
    href: '/admin/case-studies',
    color: 'text-lime-600',
    bg: 'bg-lime-50',
  },
];

export default function AdminLandingPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();

  const profileRef = useMemo(
    () => user ? doc(db, 'users', user.uid) : null,
    [db, user]
  );
  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef as any);

  if (authLoading || (profileLoading && !profile)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || profile?.role !== 'admin') {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-6">
        <ShieldAlert className="h-20 w-20 text-destructive mx-auto" />
        <h1 className="text-3xl font-bold font-headline">アクセス制限</h1>
        <p className="text-muted-foreground">管理者権限が必要です。</p>
        <Link href="/"><Button variant="outline" className="rounded-xl">トップページへ</Button></Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold font-headline flex items-center gap-3">
            <Layers className="h-8 w-8 text-primary" />
            ランディング
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            ランディングページ・静的ページに表示されるコンテンツの管理画面です。
          </p>
        </div>
        <Link href="/admin">
          <Button variant="outline" className="rounded-xl">ダッシュボードへ戻る</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {landingModules.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="hover:shadow-xl transition-all duration-300 border-none rounded-3xl group cursor-pointer h-full bg-white">
              <CardContent className="p-8 flex flex-col space-y-4">
                <div className="flex items-start justify-between">
                  <div className={`p-4 rounded-2xl ${m.bg} ${m.color} group-hover:scale-110 transition-transform`}>
                    <m.icon className="h-6 w-6" />
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{m.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{m.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="border-none shadow-lg rounded-3xl bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="p-8 space-y-3">
          <h3 className="font-bold">対象ページ</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            上記コンテンツは <Link href="/about-twrental" className="text-primary underline font-medium">/about-twrental（導入説明）</Link> ページで表示されます。<br />
            各セクションはコンテンツが0件の場合、自動的に非表示になります（利用者の声・FAQ・導入事例）。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
