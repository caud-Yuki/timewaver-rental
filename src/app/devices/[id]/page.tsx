
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { ChevronLeft, CheckCircle2, ShieldCheck, Clock, Package, Zap, Sparkles, Loader2 } from 'lucide-react';
import { Device, DeviceTypeCode } from '@/types';
import { visualizeField, VisualizeFieldOutput } from '@/ai/flows/visualize-field-flow';

export default function DeviceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const db = useFirestore();
  const id = params.id as string;

  const [intent, setIntent] = useState('');
  const [visualization, setVisualization] = useState<VisualizeFieldOutput | null>(null);
  const [isVisualizing, setIsVisualizing] = useState(false);

  const deviceRef = useMemoFirebase(() => {
    if (!db || !id) return null;
    return doc(db, 'devices', id);
  }, [db, id]);

  const { data: device, loading } = useDoc<Device>(deviceRef as any);

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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <div className="animate-pulse flex flex-col items-center space-y-4">
          <div className="h-64 w-96 bg-muted rounded-3xl" />
          <div className="h-8 w-64 bg-muted rounded-lg" />
        </div>
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

  const getDeviceImage = (code?: DeviceTypeCode) => {
    const hint = PlaceHolderImages.find(i => i.id === code?.replace('tw-', 'tw'));
    return hint?.imageUrl || 'https://picsum.photos/seed/placeholder/800/600';
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <Button variant="ghost" onClick={() => router.back()} className="mb-8 rounded-xl">
        <ChevronLeft className="mr-2 h-4 w-4" /> 戻る
      </Button>

      <div className="grid gap-12 lg:grid-cols-2 items-start">
        <div className="space-y-6">
          <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl border-4 border-white">
            <Image
              src={getDeviceImage(device.typeCode) || 'https://picsum.photos/seed/1/800/600'}
              alt={device.type || ''}
              fill
              className="object-cover"
              data-ai-hint="medical device"
            />
          </div>
          
          {/* AI Visualization Feature */}
          <Card className="border-none shadow-2xl bg-gradient-to-br from-primary/10 via-background to-accent/10 rounded-[2.5rem] overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-headline">
                <Sparkles className="h-5 w-5 text-primary" />
                フィールドの可視化体験
              </CardTitle>
              <CardDescription>TimeWaverが分析する「情報場」のイメージをAIで生成します。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {visualization ? (
                <div className="space-y-4 animate-in zoom-in duration-500">
                  <div className="relative aspect-square rounded-2xl overflow-hidden shadow-inner border border-white/50">
                    <Image src={visualization.imageUrl} alt="Visualization" fill className="object-cover" />
                  </div>
                  <p className="text-sm italic text-center text-muted-foreground px-4">
                    "{visualization.interpretation}"
                  </p>
                  <Button variant="outline" className="w-full rounded-xl" onClick={() => setVisualization(null)}>
                    別の意図で試す
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground ml-1">現在のフォーカス・意図を入力</label>
                    <Input 
                      placeholder="例: 心身の調和、ビジネスの成功" 
                      className="rounded-xl border-white/40 bg-white/40 backdrop-blur-sm"
                      value={intent}
                      onChange={(e) => setIntent(e.target.value)}
                    />
                  </div>
                  <Button 
                    className="w-full rounded-xl font-bold bg-primary hover:bg-primary/90 shadow-lg" 
                    onClick={handleVisualize}
                    disabled={isVisualizing || !intent.trim()}
                  >
                    {isVisualizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    フィールドを生成
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 uppercase">{device.typeCode}</Badge>
              {device.status === 'available' ? (
                <Badge className="bg-emerald-500 hover:bg-emerald-600 border-none">利用可能</Badge>
              ) : (
                <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white border-none">予約受付中</Badge>
              )}
            </div>
            <h1 className="font-headline text-4xl font-bold mb-4">{device.type}</h1>
            <p className="text-muted-foreground leading-relaxed">{device.description}</p>
          </div>

          <Separator />

          <Tabs defaultValue="12m" className="w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">料金プランを選択</h3>
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
                    <span className="text-3xl font-bold text-primary">¥{device.price?.[m as keyof Device['price']].monthly.toLocaleString()}</span>
                    <span className="text-sm text-muted-foreground"> / 月</span>
                  </div>
                  <div className="p-6 rounded-2xl border-2 border-secondary bg-secondary/5">
                    <span className="text-xs text-muted-foreground font-bold block mb-1">一括払い</span>
                    <span className="text-3xl font-bold">¥{device.price?.[m as keyof Device['price']].full.toLocaleString()}</span>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <div className="space-y-4 pt-4">
            <Link href={`/apply/new?deviceId=${device.id}`} className="block">
              <Button className="w-full h-14 rounded-2xl text-lg font-bold shadow-xl shadow-primary/20" disabled={device.status !== 'available'}>
                {device.status === 'available' ? 'この機器を申し込む' : '空き通知を受け取る'}
              </Button>
            </Link>
          </div>

          <div className="bg-secondary/20 rounded-2xl p-6 space-y-4">
            <h4 className="font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" /> パッケージ内容
            </h4>
            <ul className="text-sm space-y-2">
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> TimeWaver 本体デバイス</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> 専用キャリングケース</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> 電源アダプター・各種ケーブル</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> 基本操作マニュアル・ガイドブック</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
