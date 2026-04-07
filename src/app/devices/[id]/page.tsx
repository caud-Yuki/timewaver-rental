'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useDoc, useFirestore, useMemoFirebase, useCollection, useUser } from '@/firebase';
import { doc, collection, query, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { ChevronLeft, ChevronLeftIcon, ChevronRightIcon, CheckCircle2, ShieldCheck, Clock, Package, Zap, Sparkles, Loader2, Users, Timer, Percent } from 'lucide-react';
import { Device, DeviceTypeCode, Waitlist, GlobalSettings } from '@/types';
import { calculateTotalMonthly, calculateTotalFull, calculateModuleAddon } from '@/lib/module-pricing';
import { visualizeField, VisualizeFieldOutput } from '@/ai/flows/visualize-field-flow';
import { useToast } from '@/hooks/use-toast';

function DeviceImageViewer({ imageUrls, imageUrl, fallback, alt }: { imageUrls?: string[]; imageUrl?: string; fallback: string; alt: string }) {
  const images = (imageUrls && imageUrls.length > 0) ? imageUrls : (imageUrl ? [imageUrl] : [fallback]);
  const [activeIndex, setActiveIndex] = useState(0);
  const hasMultiple = images.length > 1;

  const goNext = () => setActiveIndex(prev => (prev + 1) % images.length);
  const goPrev = () => setActiveIndex(prev => (prev - 1 + images.length) % images.length);

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl border-4 border-white group">
        <Image
          src={images[activeIndex]}
          alt={alt}
          fill
          className="object-cover transition-all duration-300"
        />
        {/* Navigation arrows */}
        {hasMultiple && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
            >
              <ChevronRightIcon className="h-6 w-6" />
            </button>
            {/* Counter */}
            <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full">
              {activeIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>
      {/* Thumbnails */}
      {hasMultiple && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`relative w-20 h-14 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all ${
                i === activeIndex ? 'border-primary ring-2 ring-primary/30' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img src={url} alt={`${alt} ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DeviceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const id = params.id as string;

  const settingsRef = useMemo(() => db ? doc(db, 'settings', 'global') : null, [db]);
  const { data: globalSettings } = useDoc<GlobalSettings>(settingsRef as any);
  const moduleBasePrice = globalSettings?.moduleBasePrice || 0;

  const [intent, setIntent] = useState('');
  const [visualization, setVisualization] = useState<VisualizeFieldOutput | null>(null);
  const [isVisualizing, setIsVisualizing] = useState(false);
  const [isLocking, setIsLocking] = useState(false);

  const deviceRef = useMemoFirebase(() => {
    if (!db || !id) return null;
    return doc(db, 'devices', id);
  }, [db, id]);

  const { data: device, loading } = useDoc<Device>(deviceRef as any);

  const deviceWaitlistQuery = useMemoFirebase(() => {
    if (!db || !id) return null;
    return query(
      collection(db, 'waitlist'),
      where('deviceId', '==', id),
      where('status', '==', 'waiting')
    );
  }, [db, id]);
  const { data: deviceWaitlistItems } = useCollection<Waitlist>(deviceWaitlistQuery as any);
  
  const userWaitlistQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'waitlist'), where('userId', '==', user.uid));
  }, [db, user]);

  const { data: userWaitlist } = useCollection<Waitlist>(userWaitlistQuery as any);

  const userWaitlistDeviceTypes = useMemo(() => 
    userWaitlist ? userWaitlist.map(entry => entry.deviceType) : []
  , [userWaitlist]);

  const handleVisualize = async () => {
    if (!intent.trim()) return;
    setIsVisualizing(true);
    try {
      const res = await visualizeField({ intent });
      setVisualization(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsVisualizing(false);
    }
  };

  const handleApply = async () => {
    if (!db || !device || !user) {
      if (!user) router.push('/auth/login');
      return;
    }

    setIsLocking(true);
    try {
      // Set the global lock on the device record
      await updateDoc(doc(db, 'devices', device.id), {
        status: 'processing',
        currentUserId: user.uid,
        updatedAt: serverTimestamp()
      });
      router.push(`/apply/new?deviceId=${device.id}`);
    } catch (err) {
      toast({ variant: 'destructive', title: 'エラー', description: '申し込み手続きの開始に失敗しました。' });
    } finally {
      setIsLocking(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="animate-spin text-primary h-12 w-12" />
      </div>
    );
  }

  if (!device) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">機器が見つかりませんでした</h1>
        <Link href="/devices">
          <Button variant="outline">機器一覧に戻る</Button>
        </Link>
      </div>
    );
  }

  const getDeviceImage = () => {
    // Use uploaded images first (imageUrls[0] or legacy imageUrl), fallback to placeholder
    if (device?.imageUrls?.length > 0) return device.imageUrls[0];
    if (device?.imageUrl) return device.imageUrl;

    const code = device?.typeCode;
    if (!code) return 'https://picsum.photos/seed/placeholder/800/600';
    const hint = PlaceHolderImages.find(i => i.id === (code as unknown as string).replace('tw-', 'tw'));
    return hint?.imageUrl || 'https://picsum.photos/seed/placeholder/800/600';
  };

  const isAvailable = device.status === 'available';
  const isProcessing = device.status === 'processing';
  const isUnderReview = device.status === 'under_review';
  const isMeProcessing = isProcessing && device.currentUserId === user?.uid;
  const isMeUnderReview = isUnderReview && device.currentUserId === user?.uid;
  const isOnWaitlist = userWaitlistDeviceTypes.includes(device.type);
  const waitlistCount = deviceWaitlistItems?.length || 0;

  return (
    <div className="container mx-auto px-4 py-12">
      <Button variant="ghost" onClick={() => router.back()} className="mb-8 rounded-xl">
        <ChevronLeft className="mr-2 h-4 w-4" /> 戻る
      </Button>

      <div className="grid gap-12 lg:grid-cols-2 items-start">
        <div className="space-y-6">
          <DeviceImageViewer
            imageUrls={device.imageUrls}
            imageUrl={device.imageUrl}
            fallback={getDeviceImage()}
            alt={device.type || ''}
          />
        </div>

        <div className="space-y-8">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 uppercase px-3 py-1">{device.type}</Badge>
              {isAvailable ? (
                <Badge className="bg-emerald-500 hover:bg-emerald-600 border-none px-3 py-1">利用可能</Badge>
              ) : isUnderReview ? (
                <Badge className="bg-orange-500 text-white border-none px-3 py-1">審査中</Badge>
              ) : isProcessing ? (
                <Badge className="bg-blue-500 text-white border-none px-3 py-1">手続き中</Badge>
              ) : isOnWaitlist ? (
                 <Badge variant="secondary" className="bg-gray-400 text-white border-none flex items-center gap-1 py-1.5 px-4 shadow-lg">キャンセル待ち済</Badge>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white border-none px-3 py-1">キャンセル待ち受付中</Badge>
                  {user && waitlistCount > 0 && (
                    <span className="text-xs font-bold text-amber-600 flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">
                      <Users className="h-3 w-3" /> 現在 {waitlistCount} 名が空き待ち中です
                    </span>
                  )}
                </div>
              )}
            </div>
            <h1 className="font-headline text-4xl font-bold mb-4">{device.type}</h1>
            <p className="text-muted-foreground leading-relaxed text-lg">{device.description}</p>
          </div>

          <Separator />

          <Tabs defaultValue="12m" className="w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">料金プラン</h3>
              <TabsList className="bg-secondary/50 rounded-xl p-1">
                <TabsTrigger value="3m" className="rounded-lg">3ヶ月</TabsTrigger>
                <TabsTrigger value="6m" className="rounded-lg">6ヶ月</TabsTrigger>
                <TabsTrigger value="12m" className="rounded-lg">12ヶ月</TabsTrigger>
              </TabsList>
            </div>
            {['3m', '6m', '12m'].map((m) => (
              <TabsContent key={m} value={m} className="space-y-4 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-6 rounded-2xl border-2 border-primary bg-primary/5 shadow-sm">
                    <span className="text-xs text-primary font-bold block mb-1">月々払い</span>
                    <span className="text-3xl font-bold text-primary">¥{calculateTotalMonthly(device.price?.[m as keyof Device['price']].monthly || 0, device.modules, moduleBasePrice).toLocaleString()}</span>
                    <span className="text-sm text-muted-foreground"> / 月</span>
                    {moduleBasePrice > 0 && device.modules && device.modules.length > 0 && (
                      <span className="text-[10px] text-muted-foreground block mt-1">（モジュール加算 +¥{calculateModuleAddon(device.modules, moduleBasePrice).toLocaleString()}/月）</span>
                    )}
                  </div>
                  <div className="p-6 rounded-2xl border-2 border-secondary bg-secondary/5 relative">
                    <span className="text-xs text-muted-foreground font-bold block mb-1">一括払い</span>
                    <span className="text-3xl font-bold">¥{calculateTotalFull(device.price?.[m as keyof Device['price']].full || 0, device.modules, moduleBasePrice, parseInt(m)).toLocaleString()}</span>
                    {device.fullPaymentDiscountRate && device.fullPaymentDiscountRate > 0 && (
                      <Badge className="absolute -top-3 -right-2 bg-rose-500 text-white font-bold text-[10px]">
                        {device.fullPaymentDiscountRate}% OFF
                      </Badge>
                    )}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <div className="space-y-4 pt-4">
            {isAvailable ? (
              <Button
                className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl shadow-primary/20"
                onClick={handleApply}
                disabled={isLocking}
              >
                {isLocking ? <Loader2 className="animate-spin h-6 w-6" /> : 'この機器を申し込む'}
              </Button>
            ) : isUnderReview ? (
              isMeUnderReview ? (
                <Button variant="outline" disabled className="w-full h-16 rounded-2xl text-xl font-bold">
                  <CheckCircle2 className="mr-2 h-6 w-6 text-emerald-500" /> 申請済み — 審査中です
                </Button>
              ) : isOnWaitlist ? (
                <Button variant="secondary" disabled className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl bg-gray-400 text-white border-none">
                  <Clock className="mr-2 h-6 w-6" /> キャンセル待ち済
                </Button>
              ) : (
                <Link href={`/apply/waitlist?deviceId=${device.id}`} className="block">
                  <Button variant="secondary" className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl bg-amber-500 hover:bg-amber-600 text-white border-none">
                    <Clock className="mr-2 h-6 w-6" /> 空き通知を受け取る（現在審査中）
                  </Button>
                </Link>
              )
            ) : isProcessing ? (
              isMeProcessing ? (
                <Link href={`/apply/new?deviceId=${device.id}`} className="block">
                  <Button className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl bg-primary">
                    手続きを続行 <Timer className="ml-2 h-6 w-6" />
                  </Button>
                </Link>
              ) : (
                <Button variant="outline" disabled className="w-full h-16 rounded-2xl text-xl font-bold opacity-50">
                  手続き中 — しばらくお待ちください
                </Button>
              )
            ) : isOnWaitlist ? (
               <Button variant="secondary" disabled className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl bg-gray-400 text-white border-none">
                  <Clock className="mr-2 h-6 w-6" /> キャンセル待ち済
              </Button>
            ) : (
              <Link href={`/apply/waitlist?deviceId=${device.id}`} className="block">
                <Button variant="secondary" className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl bg-amber-500 hover:bg-amber-600 text-white border-none">
                  <Clock className="mr-2 h-6 w-6" /> 空き通知を受け取る
                </Button>
              </Link>
            )}
          </div>

          {/* Installed Modules */}
          {device.modules && device.modules.length > 0 && (
            <div className="bg-purple-50/50 rounded-2xl p-6 space-y-4">
              <h4 className="font-bold flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-500" /> 搭載モジュール
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {device.modules.map((mod, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-white rounded-xl px-3 py-2 border">
                    <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                    <span>{mod.name}</span>
                    {moduleBasePrice > 0 && mod.point > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-auto">+¥{(moduleBasePrice * mod.point).toLocaleString()}/月</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Package Contents */}
          <div className="bg-secondary/20 rounded-2xl p-6 space-y-4">
            <h4 className="font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" /> パッケージ内容
            </h4>
            <ul className="text-sm space-y-2">
              {(device.packageContents && device.packageContents.length > 0
                ? device.packageContents
                : ['TimeWaver 本体デバイス', '専用キャリングケース', '電源アダプター・各種ケーブル', '基本操作マニュアル・ガイドブック']
              ).map((item, i) => (
                <li key={i} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
