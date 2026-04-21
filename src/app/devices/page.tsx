'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Activity, Cpu, CheckCircle2, Clock, Loader2, AlertCircle, Timer, Sparkles, Rocket, Phone, ArrowRight, Bell } from 'lucide-react';
import { Device, DeviceTypeCode, Waitlist, GlobalSettings } from '@/types';
import { doc } from 'firebase/firestore';
import { useDoc } from '@/firebase';
import { calculateTotalMonthly } from '@/lib/module-pricing';

export default function DeviceListPage() {
  const [filter, setFilter] = useState<DeviceTypeCode | 'all'>('all');
  const { user } = useUser();
  const db = useFirestore();

  const settingsRef = useMemo(() => db ? doc(db, 'settings', 'global') : null, [db]);
  const { data: globalSettings } = useDoc<GlobalSettings>(settingsRef as any);
  const moduleBasePrice = globalSettings?.moduleBasePrice || 0;
  const preBookingMode = globalSettings?.preBookingMode === true;
  const consultationUrl = globalSettings?.consultationBookingUrl || '';

  const devicesQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'devices'), orderBy('typeCode'));
  }, [db]);

  const userWaitlistQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'waitlist'), where('userId', '==', user.uid));
  }, [db, user]);

  const { data: devices, loading, error } = useCollection<Device>(devicesQuery as any);
  const { data: userWaitlist } = useCollection<Waitlist>(userWaitlistQuery as any);

  const userWaitlistDeviceTypes = useMemo(() => 
    userWaitlist.map(entry => entry.deviceType)
  , [userWaitlist]);

  // Public catalog: hide admin-disabled devices (isPublic === false).
  // Devices without an isPublic field default to visible.
  const publicDevices = useMemo(
    () => devices.filter(d => d.isPublic !== false),
    [devices]
  );

  const filteredDevices = publicDevices.filter(d =>
    filter === 'all' || (d.typeCode as DeviceTypeCode | 'all') === filter
  );

  // Empty state triggers only when the catalog itself has no visible devices
  // (not simply when the current tab filter yields zero). Use publicDevices
  // rather than filteredDevices so Coming Soon doesn't flash on tab switches.
  const showComingSoon = !loading && publicDevices.length === 0;

  const getDeviceImage = (device?: any) => {
    // Use uploaded images first (imageUrls[0] or legacy imageUrl), fallback to placeholder
    if (device?.imageUrls?.length > 0) return device.imageUrls[0];
    if (device?.imageUrl) return device.imageUrl;

    const code = device?.typeCode;
    if (!code) return 'https://picsum.photos/seed/placeholder/800/600';

    const hint = PlaceHolderImages.find(i => i.id === (code as unknown as string).replace('tw-', 'tw'));
    return hint?.imageUrl || 'https://picsum.photos/seed/placeholder/600/400';
  };

  if (error) {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-6">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-3xl font-bold">アクセス権限エラー</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          機器情報の取得に失敗しました。
        </p>
        <Button onClick={() => window.location.reload()} variant="outline" className="rounded-xl">
          再読み込みする
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col space-y-4 mb-12 items-center text-center">
        <h1 className="font-headline text-4xl font-bold tracking-tight sm:text-5xl">レンタル機器一覧</h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          あなたのニーズに合わせて最適なTimeWaverデバイスをお選びください。
        </p>
      </div>

      {!showComingSoon && (
        <div className="flex justify-center mb-12">
          <Tabs defaultValue="all" className="w-full max-w-2xl" onValueChange={(value) => setFilter(value as DeviceTypeCode | 'all')}>
            <TabsList className="grid w-full grid-cols-5 h-12 rounded-2xl bg-secondary/50 p-1">
              <TabsTrigger value="all" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">すべて</TabsTrigger>
              <TabsTrigger value="tw-m" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">Mobile</TabsTrigger>
              <TabsTrigger value="tw-mq" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">MQ</TabsTrigger>
              <TabsTrigger value="tw-tt" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">Tabletop</TabsTrigger>
              <TabsTrigger value="tw-frq" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">Freq</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {loading ? (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-[450px] bg-muted rounded-[2rem] animate-pulse" />)}
        </div>
      ) : showComingSoon ? (
        <ComingSoonState preBookingMode={preBookingMode} consultationUrl={consultationUrl} />
      ) : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {filteredDevices.length === 0 ? (
            <div className="col-span-full text-center py-20 text-muted-foreground">
              該当する機器が見つかりませんでした。
            </div>
          ) : (
            filteredDevices.map((device) => {
              const isAvailable = device.status === 'available';
              const isProcessing = device.status === 'processing';
              const isUnderReview = device.status === 'under_review';
              const isOnWaitlist = userWaitlistDeviceTypes.includes(device.type);

              // NEW badge: isNew flag + auto-expire after 6 months from createdAt
              const sixMonthsAgo = new Date();
              sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
              const createdDate = device.createdAt?.seconds ? new Date(device.createdAt.seconds * 1000) : null;
              const isNewDevice = device.isNew === true && (!createdDate || createdDate > sixMonthsAgo);

              return (
                <Card key={device.id} className="overflow-hidden group hover:shadow-2xl transition-all duration-300 border-none shadow-lg bg-white rounded-[2rem]">
                  <div className="relative aspect-video overflow-hidden">
                    <Image
                      src={getDeviceImage(device) || 'https://picsum.photos/seed/placeholder/600/400'}
                      alt={device.type || ''}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                    {isNewDevice && (
                      <div className="absolute top-4 right-4 z-10">
                        <Badge className="bg-rose-500 hover:bg-rose-600 text-white border-none py-1 px-3 text-xs font-bold shadow-lg animate-pulse">
                          NEW
                        </Badge>
                      </div>
                    )}
                    <div className="absolute top-4 left-4">
                      {isAvailable ? (
                        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none flex items-center gap-1 py-1.5 px-4 shadow-lg">
                          <CheckCircle2 className="h-3.5 w-3.5" /> 利用可能
                        </Badge>
                      ) : isUnderReview ? (
                        <Badge variant="secondary" className="bg-orange-500 text-white border-none flex items-center gap-1 py-1.5 px-4 shadow-lg">
                          <Clock className="h-3.5 w-3.5" /> 審査中
                        </Badge>
                      ) : isProcessing ? (
                        <Badge variant="secondary" className="bg-blue-500 text-white border-none flex items-center gap-1 py-1.5 px-4 shadow-lg">
                          <Timer className="h-3.5 w-3.5" /> 手続き中
                        </Badge>
                      ) : isOnWaitlist ? (
                        <Badge variant="secondary" className="bg-gray-400 text-white border-none flex items-center gap-1 py-1.5 px-4 shadow-lg">
                          <Clock className="h-3.5 w-3.5" /> キャンセル待ち済
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white border-none flex items-center gap-1 py-1.5 px-4 shadow-lg">
                          <Clock className="h-3.5 w-3.5" /> キャンセル待ち受付中
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 uppercase">{device.typeCode.type}</Badge>
                      <span className="text-xs text-muted-foreground font-mono">{device.serialNumber}</span>
                    </div>
                    <CardTitle className="font-headline text-2xl group-hover:text-primary transition-colors">{device.type}</CardTitle>
                    <CardDescription className="line-clamp-2">{device.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">月額料金 (12ヶ月〜)</span>
                        <span className="font-bold text-xl text-primary">¥{calculateTotalMonthly(device.price?.['12m'].monthly || 0, device.modules, moduleBasePrice).toLocaleString()} <span className="text-xs text-muted-foreground font-normal">/ 月</span></span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="bg-secondary/10 p-4">
                    <Link href={`/devices/${device.id}`} className="w-full">
                      <Button
                        className="w-full font-bold h-12 rounded-xl shadow-md group-hover:shadow-primary/20 transition-all"
                        variant={!preBookingMode && isAvailable ? 'default' : 'outline'}
                        disabled={!preBookingMode && isOnWaitlist}
                      >
                        {preBookingMode
                          ? '詳細'
                          : (isAvailable ? '詳細・お申し込み' : (isOnWaitlist ? 'キャンセル待ち済' : '詳細'))}
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Coming Soon empty state — shown on /devices when the public catalog has zero
 * visible devices (either no devices registered, or all toggled to isPublic=false).
 * The primary CTA adapts to site state: early-booking form when preBookingMode is
 * on, otherwise a consultation link when configured.
 */
function ComingSoonState({
  preBookingMode,
  consultationUrl,
}: {
  preBookingMode: boolean;
  consultationUrl: string;
}) {
  return (
    <div className="max-w-3xl mx-auto py-12">
      <div className="relative bg-gradient-to-br from-primary/10 via-white to-primary/5 rounded-[3rem] p-12 md:p-16 overflow-hidden shadow-xl border border-primary/10">
        {/* Decorative orbs */}
        <div className="absolute top-0 right-0 h-64 w-64 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 bg-primary/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />

        <div className="relative z-10 text-center space-y-8">
          {/* Animated icon cluster */}
          <div className="relative inline-flex">
            <div className="h-24 w-24 rounded-3xl bg-primary/15 flex items-center justify-center">
              <Sparkles className="h-12 w-12 text-primary animate-pulse" />
            </div>
            <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-rose-400 flex items-center justify-center animate-bounce">
              <Bell className="h-4 w-4 text-white" />
            </div>
          </div>

          <div className="space-y-4">
            <Badge variant="outline" className="px-4 py-1 text-primary border-primary/30 bg-primary/5">
              COMING SOON
            </Badge>
            <h2 className="font-headline text-3xl md:text-5xl font-bold tracking-tight">
              まもなくラインナップを公開
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed max-w-xl mx-auto">
              現在、TimeWaverデバイスのラインナップを準備中です。<br />
              正式公開の際には、下記フォームからご登録いただいた方に優先的にご案内差し上げます。
            </p>
          </div>

          {/* Primary CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            {preBookingMode ? (
              <Link href="/early-booking">
                <Button size="lg" className="rounded-2xl h-14 px-10 font-bold shadow-xl shadow-primary/20">
                  <Rocket className="mr-2 h-5 w-5" />
                  先行予約に登録する
                </Button>
              </Link>
            ) : consultationUrl ? (
              <a href={consultationUrl} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="rounded-2xl h-14 px-10 font-bold shadow-xl shadow-primary/20">
                  <Phone className="mr-2 h-5 w-5" />
                  無料相談を予約する
                </Button>
              </a>
            ) : (
              <Link href="/about-twrental">
                <Button size="lg" className="rounded-2xl h-14 px-10 font-bold shadow-xl shadow-primary/20">
                  サービス詳細を見る
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            )}
            <Link href="/about-twrental">
              <Button variant="outline" size="lg" className="rounded-2xl h-14 px-8">
                TimeWaverについて知る
              </Button>
            </Link>
          </div>

          {/* Secondary info */}
          <div className="pt-6 border-t border-primary/10">
            <p className="text-xs text-muted-foreground">
              お急ぎの方は <Link href="/about-twrental" className="text-primary underline font-medium">導入説明ページ</Link> もご覧ください。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
