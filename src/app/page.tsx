'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ShieldCheck, Activity, Zap, Headphones, Newspaper } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { News } from '@/types';

export default function Home() {
  const heroImage = PlaceHolderImages?.find(img => img.id === 'hero-bg');
  const db = useFirestore();

  const newsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(
      collection(db, 'news'),
      where('status', '==', 'published'),
      orderBy('publishedAt', 'desc'),
      limit(3)
    );
  }, [db]);

  const { data: newsItems, loading: newsLoading } = useCollection<News>(newsQuery as any);

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative w-full py-12 md:py-24 lg:py-32 overflow-hidden bg-primary/5">
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 items-center">
            <div className="flex flex-col justify-center space-y-4">
              <div className="space-y-2">
                <Badge variant="secondary" className="w-fit mb-2 bg-accent/20 text-accent hover:bg-accent/30 border-none px-4 py-1">
                  NEW: TimeWaver Mobile Quantum 入荷
                </Badge>
                <h1 className="font-headline text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">
                  次世代のエネルギー医学を、<br />
                  <span className="text-primary">手軽にレンタル。</span>
                </h1>
                <p className="max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  TimeWaverデバイスを月額から手軽に導入。専門的な知識がなくても、あなたのビジネスやライフスタイルに最高峰のテクノロジーを。
                </p>
              </div>
              <div className="flex flex-col gap-2 min-[400px]:flex-row">
                <Link href="/devices">
                  <Button size="lg" className="font-semibold text-lg px-8 py-6 rounded-xl shadow-lg">
                    レンタル機器を見る
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/guide">
                  <Button size="lg" variant="outline" className="font-semibold text-lg px-8 py-6 rounded-xl">
                    導入の流れを確認
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative aspect-video lg:aspect-square rounded-3xl overflow-hidden shadow-2xl border-8 border-white">
              <Image
                src={heroImage?.imageUrl || "https://images.unsplash.com/photo-1576091160550-2173dad99901?q=80&w=2070&auto=format&fit=crop"}
                alt="ChronoRent Hero"
                fill
                className="object-cover"
                priority
                data-ai-hint="medical technology"
              />
            </div>
          </div>
        </div>
      </section>

      {/* News Section */}
      <section className="py-12 bg-secondary/10">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-end mb-8">
            <div className="space-y-1">
              <h3 className="font-headline text-2xl font-bold">お知らせ</h3>
              <p className="text-sm text-muted-foreground">最新のアップデートとニュース</p>
            </div>
            <Link href="/news" className="text-primary text-sm font-bold flex items-center hover:underline">
              一覧を見る <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {newsItems?.map(item => (
              <Card key={item.id} className="border-none shadow-md rounded-2xl overflow-hidden bg-white hover:shadow-xl transition-shadow cursor-pointer">
                <CardHeader className="pb-2">
                  <Badge variant="outline" className="w-fit text-[10px] mb-2">
                    {item.publishedAt?.seconds ? new Date(item.publishedAt.seconds * 1000).toLocaleDateString() : 'New'}
                  </Badge>
                  <CardTitle className="text-lg line-clamp-1">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.body}</p>
                </CardContent>
              </Card>
            ))}
            {(!newsItems || newsItems.length === 0) && !newsLoading && (
              <div className="col-span-full text-center py-10 text-muted-foreground">現在お知らせはありません</div>
            )}
          </div>
        </div>
      </section>

      {/* Feature Section */}
      <section className="py-12 md:py-24 lg:py-32 bg-white">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
            <h2 className="font-headline text-3xl font-bold tracking-tighter sm:text-5xl">なぜChronoRentなのか？</h2>
            <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              高価なデバイスを安心して利用いただくための、充実したサポートと柔軟なプラン。
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            <Card className="border-none shadow-md bg-background/50 hover:shadow-lg transition-shadow">
              <CardHeader>
                <ShieldCheck className="h-12 w-12 text-accent mb-2" />
                <CardTitle className="font-headline">安心のサポート体制</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  導入時の設定からトラブル対応まで、専門スタッフが迅速にサポートします。
                </p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-md bg-background/50 hover:shadow-lg transition-shadow">
              <CardHeader>
                <Zap className="h-12 w-12 text-primary mb-2" />
                <CardTitle className="font-headline">柔軟な契約プラン</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  3ヶ月、6ヶ月、12ヶ月から選べる期間。ニーズに合わせて柔軟に調整可能です。
                </p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-md bg-background/50 hover:shadow-lg transition-shadow">
              <CardHeader>
                <Headphones className="h-12 w-12 text-accent mb-2" />
                <CardTitle className="font-headline">AIによる24時間応対</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  基本的な操作方法や質問は、24時間稼働のAIチャットボットが即座にお答えします。
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
