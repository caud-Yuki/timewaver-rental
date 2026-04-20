'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { doc, collection, query, orderBy, where } from 'firebase/firestore';
import { useFirestore, useDoc, useCollection } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Award, ShieldCheck, Globe2, Sparkles,
  Wallet, Wrench, Rocket, ChevronRight,
  CheckCircle2, XCircle, Phone, ArrowRight, Quote
} from 'lucide-react';
import { useServiceName } from '@/hooks/use-service-name';
import {
  GlobalSettings, Testimonial, Faq, CaseStudy, Device,
  testimonialConverter, faqConverter, caseStudyConverter, deviceConverter
} from '@/types';

export default function AboutTWRentalPage() {
  const db = useFirestore();
  const serviceName = useServiceName();

  const settingsRef = useMemo(() => db ? doc(db, 'settings', 'global') : null, [db]);
  const { data: settings } = useDoc<GlobalSettings>(settingsRef as any);

  const testimonialsQuery = useMemo(
    () => db ? query(collection(db, 'testimonials'), where('isPublic', '==', true), orderBy('order', 'asc')).withConverter(testimonialConverter) : null,
    [db]
  );
  const { data: testimonials } = useCollection<Testimonial>(testimonialsQuery as any);

  const faqsQuery = useMemo(
    () => db ? query(collection(db, 'faqs'), where('isPublic', '==', true), orderBy('order', 'asc')).withConverter(faqConverter) : null,
    [db]
  );
  const { data: faqs } = useCollection<Faq>(faqsQuery as any);

  const caseStudiesQuery = useMemo(
    () => db ? query(collection(db, 'caseStudies'), where('isPublic', '==', true), orderBy('order', 'asc')).withConverter(caseStudyConverter) : null,
    [db]
  );
  const { data: caseStudies } = useCollection<CaseStudy>(caseStudiesQuery as any);

  const devicesQuery = useMemo(
    () => db ? query(collection(db, 'devices'), orderBy('typeCode', 'asc')).withConverter(deviceConverter) : null,
    [db]
  );
  const { data: devices } = useCollection<Device>(devicesQuery as any);

  // One device per unique typeCode for the digest section
  const deviceDigest = useMemo(() => {
    const seen = new Set<string>();
    return (devices || []).filter(d => {
      if (seen.has(d.typeCode)) return false;
      seen.add(d.typeCode);
      return true;
    }).slice(0, 4);
  }, [devices]);

  const preBookingMode = settings?.preBookingMode === true;
  const consultationUrl = settings?.consultationBookingUrl || '';

  return (
    <div className="container mx-auto px-4 py-16 space-y-28">
      {/* 01 HERO */}
      <section className="text-center space-y-8 max-w-4xl mx-auto">
        <Badge variant="outline" className="px-4 py-1 text-primary border-primary/20 bg-primary/5">
          TIMEWAVER JAPAN 総代理店公式レンタルサービス
        </Badge>
        <h1 className="font-headline text-4xl md:text-6xl font-bold tracking-tight">
          日本でTimeWaverを始める、<br />
          <span className="text-primary">最短・最安の道。</span>
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          高額な初期投資なしに、月額固定でTimeWaverを導入・検証できます。
          セットアップから日本語サポートまで、TimeWaver Japan 総代理店が全てお届けします。
        </p>
      </section>

      {/* 02 WHY US */}
      <section className="space-y-12">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h2 className="font-headline text-3xl md:text-4xl font-bold">なぜ私たちからレンタルするのか？</h2>
          <p className="text-muted-foreground">
            TimeWaver Japan 総代理店として、メーカー公認の安心と、豊富な運用実績に基づくサポートをご提供します。
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {[
            {
              icon: Award,
              title: '総代理店だからこその安心サポート',
              desc: 'TimeWaver Japan 総代理店として、導入・運用・トラブル対応まで一貫してサポート。購入後も安心して長くお使いいただけます。',
              color: 'text-amber-500', bg: 'bg-amber-50',
            },
            {
              icon: ShieldCheck,
              title: 'TimeWaverの豊富な知識と経験',
              desc: '国内数百件の導入実績に基づき、業種別の最適な使い方を熟知。個別のご相談にも経験豊富なコンサルタントが対応します。',
              color: 'text-blue-500', bg: 'bg-blue-50',
            },
            {
              icon: Globe2,
              title: 'ドイツ本社との直接連携',
              desc: '最新モジュール・ファームウェアアップデートをドイツ本社から直接入手。業界最速で新機能を試せる環境をご提供します。',
              color: 'text-emerald-500', bg: 'bg-emerald-50',
            },
            {
              icon: Sparkles,
              title: 'ユーザー限定 TimeWaver ワークショップ',
              desc: 'レンタルユーザー様限定のワークショップ・勉強会へご参加いただけます。活用ノウハウを仲間と共有し、スキルを高められます。',
              color: 'text-purple-500', bg: 'bg-purple-50',
            },
          ].map((item, i) => (
            <Card key={i} className="border-none shadow-lg rounded-3xl hover:shadow-2xl transition-shadow">
              <CardContent className="p-8 space-y-4">
                <div className={`h-14 w-14 rounded-2xl ${item.bg} ${item.color} flex items-center justify-center`}>
                  <item.icon className="h-7 w-7" />
                </div>
                <h3 className="font-headline text-xl font-bold">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 03 BENEFITS */}
      <section className="space-y-12">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h2 className="font-headline text-3xl md:text-4xl font-bold">レンタルの3つのメリット</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Wallet,
              title: '購入前に手軽に導入・検証',
              desc: '初期費用ゼロ・月額固定でTimeWaverをお試し可能。ビジネスにフィットするか、実際の現場で検証できます。',
            },
            {
              icon: Wrench,
              title: 'セットアップは全てお任せ',
              desc: '機器の設定・ソフトウェアのインストール・初期トレーニングまで全てこちらで対応。届いたその日から使えます。',
            },
            {
              icon: Rocket,
              title: '業界最速で新モジュールを試せる',
              desc: 'ドイツ本社から最新モジュールが追加され次第、レンタルユーザーへ順次ご案内。常に最先端を体験できます。',
            },
          ].map((item, i) => (
            <Card key={i} className="border-none shadow-lg rounded-3xl bg-gradient-to-br from-white to-secondary/20">
              <CardContent className="p-8 space-y-4 text-center">
                <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <item.icon className="h-8 w-8" />
                </div>
                <h3 className="font-headline text-xl font-bold">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 04 TESTIMONIALS — auto-hide when empty */}
      {testimonials && testimonials.length > 0 && (
        <section className="space-y-12">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <h2 className="font-headline text-3xl md:text-4xl font-bold">利用者の声</h2>
            <p className="text-muted-foreground">
              業種も目的も様々なお客様が、TimeWaverを日々の現場で活用されています。
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <Card key={t.id} className="border-none shadow-lg rounded-3xl bg-white overflow-hidden">
                <CardContent className="p-8 space-y-4">
                  <Quote className="h-8 w-8 text-primary/20" />
                  <p className="text-sm leading-relaxed text-gray-700">"{t.comment}"</p>
                  {t.videoUrl && (
                    <div className="aspect-video rounded-xl overflow-hidden">
                      <iframe
                        src={t.videoUrl}
                        title={t.name}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-3 pt-4 border-t">
                    {t.imageUrl ? (
                      <div className="relative h-12 w-12 rounded-full overflow-hidden bg-gray-100">
                        <Image src={t.imageUrl} alt={t.name} fill className="object-cover" />
                      </div>
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                        {t.name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-bold text-sm">{t.name}</div>
                      {t.title && <div className="text-xs text-muted-foreground">{t.title}</div>}
                    </div>
                    {t.industry && <Badge variant="outline" className="text-[10px]">{t.industry}</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 05a BUY vs RENT COMPARISON */}
      <section className="space-y-10">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h2 className="font-headline text-3xl md:text-4xl font-bold">購入 vs レンタル、どちらが最適？</h2>
          <p className="text-muted-foreground">
            用途・予算・導入期間に応じて最適な選択が変わります。
          </p>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px] grid grid-cols-3 gap-4 bg-white rounded-3xl shadow-lg p-8">
            <div className="font-bold text-sm pb-3 border-b">比較項目</div>
            <div className="font-bold text-sm text-center pb-3 border-b">購入</div>
            <div className="font-bold text-sm text-center pb-3 border-b text-primary">レンタル</div>

            {[
              { label: '初期費用', buy: '数百万円〜', rent: '0円', rentWin: true },
              { label: '月額費用', buy: 'なし', rent: '固定月額', rentWin: false },
              { label: '税務処理', buy: '減価償却', rent: '全額経費', rentWin: true },
              { label: 'サポート', buy: '保証期間中まで', rent: 'ずっとサポート', rentWin: true },
              { label: '最新モジュール', buy: '都度購入', rent: '順次提供', rentWin: true },
              { label: '故障時対応', buy: '自己対応', rent: '弊社フル対応', rentWin: true },
              { label: '使用期間の柔軟性', buy: '長期固定', rent: '3/6/12ヶ月', rentWin: true },
            ].map((r, i) => (
              <div key={i} className="contents">
                <div className="py-3 border-b text-sm font-medium">{r.label}</div>
                <div className="py-3 border-b text-sm text-center text-muted-foreground">{r.buy}</div>
                <div className={`py-3 border-b text-sm text-center font-medium ${r.rentWin ? 'text-primary' : ''}`}>
                  {r.rentWin && <CheckCircle2 className="inline-block h-3.5 w-3.5 mr-1" />}{r.rent}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 05b DEVICE DIGEST */}
      {deviceDigest && deviceDigest.length > 0 && (
        <section className="space-y-10">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div className="space-y-2">
              <h2 className="font-headline text-3xl md:text-4xl font-bold">対応機種ダイジェスト</h2>
              <p className="text-muted-foreground">代表的なラインナップ。用途に応じて最適な1台をお選びいただけます。</p>
            </div>
            <Link href="/devices">
              <Button variant="outline" className="rounded-xl">
                すべての機器を見る <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {deviceDigest.map((d) => (
              <Card key={d.id} className="border-none shadow-md rounded-2xl overflow-hidden hover:shadow-xl transition-shadow">
                <div className="aspect-video relative bg-gray-100">
                  {((d as any).imageUrls?.[0] || (d as any).imageUrl) && (
                    <Image
                      src={(d as any).imageUrls?.[0] || (d as any).imageUrl}
                      alt={d.type}
                      fill
                      className="object-cover"
                    />
                  )}
                </div>
                <CardContent className="p-4 space-y-1">
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/20 bg-primary/5">
                    {d.typeCode}
                  </Badge>
                  <h3 className="font-bold text-sm">{d.type}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">{d.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 05c FLOW */}
      <section className="space-y-10">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h2 className="font-headline text-3xl md:text-4xl font-bold">ご利用の流れ</h2>
          <p className="text-muted-foreground">お申し込みから利用開始まで、最短で数日。</p>
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { step: '01', title: '機器を選ぶ', desc: 'ラインナップから最適な機種とプランを選択。' },
            { step: '02', title: '申込・審査', desc: 'オンラインフォームから申込。1〜3営業日で審査完了。' },
            { step: '03', title: '決済・発送', desc: '同意書提出・決済完了後、数営業日で機器を発送。' },
            { step: '04', title: '利用開始', desc: '届いたその日から使用可能。日本語サポートも常時対応。' },
          ].map((s, i) => (
            <div key={i} className="relative p-6 bg-white rounded-3xl shadow-lg">
              <div className="text-5xl font-headline font-bold text-primary/10 absolute top-4 right-6">{s.step}</div>
              <h3 className="font-bold text-lg mb-2 relative z-10">{s.title}</h3>
              <p className="text-sm text-muted-foreground relative z-10">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center">
          <Link href="/guide">
            <Button variant="outline" className="rounded-xl">
              詳しい流れを見る <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* 05d FAQ — auto-hide when empty */}
      {faqs && faqs.length > 0 && (
        <section className="space-y-10 max-w-3xl mx-auto">
          <div className="text-center space-y-4">
            <h2 className="font-headline text-3xl md:text-4xl font-bold">よくあるご質問</h2>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((f) => (
              <AccordionItem key={f.id} value={f.id} className="bg-white rounded-2xl border-none shadow-md px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {f.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      )}

      {/* 05e CONSULTATION CTA */}
      {consultationUrl && (
        <section className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-[3rem] p-10 md:p-16 text-center space-y-6">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/20 text-primary flex items-center justify-center">
            <Phone className="h-8 w-8" />
          </div>
          <h2 className="font-headline text-3xl md:text-4xl font-bold">無料相談をご予約</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            どの機種がお客様に最適か、レンタルで何ができるか。経験豊富なコンサルタントが直接ご相談に応じます。
          </p>
          <a href={consultationUrl} target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="rounded-2xl h-14 px-10 font-bold shadow-lg">
              相談枠を予約する <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </a>
        </section>
      )}

      {/* 05f CASE STUDIES — auto-hide when empty */}
      {caseStudies && caseStudies.length > 0 && (
        <section className="space-y-10">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <h2 className="font-headline text-3xl md:text-4xl font-bold">導入事例</h2>
            <p className="text-muted-foreground">業種・規模ごとの活用実例をご紹介します。</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {caseStudies.map((cs) => (
              <Card key={cs.id} className="border-none shadow-lg rounded-3xl overflow-hidden hover:shadow-2xl transition-shadow">
                {cs.imageUrl && (
                  <div className="aspect-video relative bg-gray-100">
                    <Image src={cs.imageUrl} alt={cs.title} fill className="object-cover" />
                  </div>
                )}
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    {cs.industry && <Badge variant="outline" className="text-[10px]">{cs.industry}</Badge>}
                    {cs.client && <span className="text-xs text-muted-foreground">{cs.client}</span>}
                  </div>
                  <h3 className="font-headline text-lg font-bold">{cs.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{cs.summary}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 05g FINAL CTA — switches on preBookingMode */}
      <section className="bg-primary rounded-[4rem] p-12 md:p-20 text-white text-center shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 h-64 w-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
        <div className="relative z-10 space-y-8 max-w-3xl mx-auto">
          {preBookingMode ? (
            <>
              <Badge className="bg-white/20 text-white border-none px-4 py-1">
                PRE-BOOKING OPEN
              </Badge>
              <h2 className="font-headline text-3xl md:text-5xl font-bold">
                先行予約受付中
              </h2>
              <p className="text-primary-foreground/80 text-xl">
                {serviceName}は現在、先行予約を受け付けています。
                正式ローンチ時に優先的にご案内差し上げます。
              </p>
              <Link href="/early-booking">
                <Button size="lg" className="bg-white text-primary hover:bg-white/90 font-bold h-14 px-12 rounded-2xl text-lg shadow-xl">
                  先行予約に登録する <ChevronRight className="ml-2 h-6 w-6" />
                </Button>
              </Link>
            </>
          ) : (
            <>
              <h2 className="font-headline text-3xl md:text-5xl font-bold">
                あなたに最適な一台を見つけよう
              </h2>
              <p className="text-primary-foreground/80 text-xl">
                全機種のラインナップ・月額料金をご確認いただけます。
              </p>
              <Link href="/devices">
                <Button size="lg" className="bg-white text-primary hover:bg-white/90 font-bold h-14 px-12 rounded-2xl text-lg shadow-xl">
                  機器ラインナップを見る <ChevronRight className="ml-2 h-6 w-6" />
                </Button>
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
