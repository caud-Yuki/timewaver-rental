import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ShieldCheck, Activity, Zap, Headphones } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

export default function Home() {
  const heroImage = PlaceHolderImages.find(img => img.id === 'hero-bg');

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <Activity className="h-8 w-8 text-primary" />
            <span className="font-headline text-2xl font-bold tracking-tight text-primary">ChronoRent</span>
          </Link>
          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium">
            <Link href="/devices" className="transition-colors hover:text-primary">機器一覧</Link>
            <Link href="/guide" className="transition-colors hover:text-primary">ご利用の流れ</Link>
            <Link href="/introduction" className="transition-colors hover:text-primary">導入説明</Link>
          </nav>
          <div className="flex items-center space-x-4">
            <Link href="/auth/login">
              <Button variant="ghost">ログイン</Button>
            </Link>
            <Link href="/auth/register">
              <Button>新規登録</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
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
      </main>

      {/* Footer */}
      <footer className="border-t bg-background py-12">
        <div className="container mx-auto px-4 grid gap-8 md:grid-cols-4">
          <div className="space-y-4">
            <Link href="/" className="flex items-center space-x-2">
              <Activity className="h-6 w-6 text-primary" />
              <span className="font-headline text-xl font-bold text-primary tracking-tight">ChronoRent</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              次世代のテクノロジーを、すべての人へ。
            </p>
          </div>
          <div>
            <h4 className="font-headline font-bold mb-4">プラットフォーム</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/devices" className="hover:text-primary transition-colors">レンタル機器一覧</Link></li>
              <li><Link href="/guide" className="hover:text-primary transition-colors">ご利用の流れ</Link></li>
              <li><Link href="/introduction" className="hover:text-primary transition-colors">導入説明</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-headline font-bold mb-4">マイページ</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/mypage/profile" className="hover:text-primary transition-colors">プロフィール設定</Link></li>
              <li><Link href="/mypage/devices" className="hover:text-primary transition-colors">マイデバイス</Link></li>
              <li><Link href="/mypage/support/ai" className="hover:text-primary transition-colors">AIサポート</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-headline font-bold mb-4">法的情報</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/privacy" className="hover:text-primary transition-colors">プライバシーポリシー</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">利用規約</Link></li>
              <li><Link href="/tokushoho" className="hover:text-primary transition-colors">特定商取引法に基づく表記</Link></li>
            </ul>
          </div>
        </div>
        <div className="container mx-auto px-4 mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} ChronoRent. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
