
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Zap, Shield, Globe, Award } from 'lucide-react';
import { useServiceName } from '@/hooks/use-service-name';

export default function IntroductionPage() {
  const serviceName = useServiceName();
  return (
    <div className="container mx-auto px-4 py-16 space-y-24">
      {/* Hero Section */}
      <section className="text-center space-y-8 max-w-4xl mx-auto">
        <Badge variant="outline" className="px-4 py-1 text-primary border-primary/20 bg-primary/5">
          TIMEWAVER TECHNOLOGY
        </Badge>
        <h1 className="font-headline text-4xl md:text-6xl font-bold tracking-tight">
          意識と物質の架け橋となる<br />
          <span className="text-primary">タイムウェーバー・テクノロジー</span>
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          TimeWaverは、ドイツの物理学者マーカス・シュミークによって開発された、
          量子場（情報場）を分析・最適化するための最先端デバイスです。
        </p>
      </section>

      {/* Philosophy Section */}
      <section className="grid md:grid-cols-2 gap-12 items-center">
        <div className="relative aspect-square rounded-[3rem] overflow-hidden shadow-2xl">
          <Image 
            src="https://images.unsplash.com/photo-1507413245164-6160d8298b31?q=80&w=2070&auto=format&fit=crop"
            alt="Science and consciousness"
            fill
            className="object-cover"
            data-ai-hint="scientific laboratory"
          />
        </div>
        <div className="space-y-6">
          <h2 className="font-headline text-3xl font-bold">情報場とは何か？</h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            現代物理学において、すべての物質や生命現象の背後には「情報」のネットワークが存在すると考えられています。
            TimeWaverはこの「情報場」にアクセスし、私たちの健康、ビジネス、人間関係のバランスを整えるためのヒントを提示します。
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-none bg-secondary/30 rounded-2xl p-4">
              <CardContent className="p-0 space-y-2">
                <Zap className="h-6 w-6 text-primary" />
                <h4 className="font-bold">非局所性</h4>
                <p className="text-xs text-muted-foreground">量子力学的なつながりを利用し、距離に依存せず情報を分析します。</p>
              </CardContent>
            </Card>
            <Card className="border-none bg-secondary/30 rounded-2xl p-4">
              <CardContent className="p-0 space-y-2">
                <Shield className="h-6 w-6 text-accent" />
                <h4 className="font-bold">多角的な分析</h4>
                <p className="text-xs text-muted-foreground">物理的な要因だけでなく、心理的、精神的な側面からもアプローチします。</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="bg-primary rounded-[4rem] p-12 md:p-20 text-white text-center shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 h-64 w-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 space-y-8">
          <h2 className="font-headline text-3xl md:text-5xl font-bold">あなたの未来を最適化する</h2>
          <p className="text-primary-foreground/80 text-xl max-w-2xl mx-auto">
            {serviceName}は、この革命的なテクノロジーをより身近にするためのプラットフォームです。
            まずはラインナップから、あなたに最適な一台を見つけてください。
          </p>
          <Link href="/devices">
            <Button size="lg" className="bg-white text-primary hover:bg-white/90 font-bold h-14 px-12 rounded-2xl text-lg shadow-xl">
              機器ラインナップを見る <ChevronRight className="ml-2 h-6 w-6" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
