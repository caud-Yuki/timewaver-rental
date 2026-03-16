'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  User, 
  CreditCard, 
  Package, 
  MessageSquare, 
  Wrench, 
  ClipboardList,
  ChevronRight,
  Sparkles,
  LayoutDashboard
} from 'lucide-react';
import { UserProfile } from '@/types';

export default function MyPageDashboard() {
  const { user, loading: authLoading } = useUser();
  const router = useRouter();
  const db = useFirestore();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, authLoading, router]);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef as any);

  if (authLoading || profileLoading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!user) return null;

  const userModules = [
    { 
      title: 'マイデバイス', 
      desc: 'レンタル中・申請中の機器確認', 
      icon: Package, 
      href: '/mypage/devices', 
      color: 'text-blue-500', 
      bg: 'bg-blue-50' 
    },
    { 
      title: '申請履歴', 
      desc: '過去のレンタル申込状況', 
      icon: ClipboardList, 
      href: '/mypage/applications', 
      color: 'text-purple-500', 
      bg: 'bg-purple-50' 
    },
    { 
      title: '支払履歴', 
      desc: '決済・領収書の確認', 
      icon: CreditCard, 
      href: '/mypage/payments', 
      color: 'text-emerald-500', 
      bg: 'bg-emerald-50' 
    },
    { 
      title: 'AIサポート', 
      desc: '24時間対応のチャット相談', 
      icon: Sparkles, 
      href: '/mypage/support/ai', 
      color: 'text-amber-500', 
      bg: 'bg-amber-50' 
    },
    { 
      title: '修理・サポート依頼', 
      desc: '故障時の修理依頼・技術相談', 
      icon: Wrench, 
      href: '/mypage/support/repair', 
      color: 'text-rose-500', 
      bg: 'bg-rose-50' 
    },
    { 
      title: '会員情報', 
      desc: 'プロフィール・配送先の設定', 
      icon: User, 
      href: '/mypage/profile', 
      color: 'text-slate-500', 
      bg: 'bg-slate-50' 
    },
  ];

  return (
    <div className="container mx-auto px-4 py-12 space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold font-headline flex items-center gap-3">
            <LayoutDashboard className="h-10 w-10 text-primary" /> マイページ
          </h1>
          <p className="text-muted-foreground">こんにちは、{profile?.givenName || 'ユーザー'}様。本日のご用件をお選びください。</p>
        </div>
        <Link href="/devices">
          <Button size="lg" className="rounded-2xl font-bold shadow-lg">新しい機器を探す</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {userModules.map((module) => (
          <Link key={module.href} href={module.href}>
            <Card className="hover:shadow-xl transition-all duration-300 border-none rounded-[2rem] group cursor-pointer h-full bg-white">
              <CardContent className="p-8 flex items-center space-x-6">
                <div className={`p-5 rounded-2xl ${module.bg} ${module.color} group-hover:scale-110 transition-transform`}>
                  <module.icon className="h-8 w-8" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg mb-1">{module.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">{module.desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Status Card */}
      <Card className="border-none shadow-2xl bg-primary rounded-[2.5rem] text-white p-8 md:p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 h-64 w-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 text-center md:text-left">
            <h2 className="text-3xl font-bold font-headline">お困りですか？</h2>
            <p className="text-primary-foreground/80 max-w-md">
              TimeWaverの操作方法や契約について、AIコンシェルジュが24時間体制でお答えします。
            </p>
          </div>
          <Link href="/mypage/support/ai">
            <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90 font-bold h-14 px-10 rounded-2xl shadow-xl">
              AIサポートを開く <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
