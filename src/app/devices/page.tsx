
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { Activity, Cpu, CheckCircle2, Clock, Loader2, AlertCircle } from 'lucide-react';
import { Device, DeviceTypeCode } from '@/types';

export default function DeviceListPage() {
  const [filter, setFilter] = useState<string>('all');
  const db = useFirestore();

  const devicesQuery = useMemoFirebase(() => {
    if (!db) return null;
    // Triggering a re-deployment check for security rules
    return query(collection(db, 'devices'), orderBy('typeCode'));
  }, [db]);

  const { data: devices, loading, error } = useCollection<Device>(devicesQuery as any);

  const filteredDevices = devices.filter(d => 
    filter === 'all' || d.typeCode === filter
  );

  const getDeviceImage = (code?: DeviceTypeCode) => {
    const hint = PlaceHolderImages.find(i => i.id === code?.replace('tw-', 'tw'));
    return hint?.imageUrl || 'https://picsum.photos/seed/placeholder/600/400';
  };

  if (error) {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-6">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-3xl font-bold">アクセス権限エラー</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          機器情報の取得に失敗しました。現在、セキュリティルールの更新を適用中です。しばらくしてから再度ページを読み込んでください。
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

      <div className="flex justify-center mb-12">
        <Tabs defaultValue="all" className="w-full max-w-2xl" onValueChange={setFilter}>
          <TabsList className="grid w-full grid-cols-5 h-12 rounded-2xl bg-secondary/50 p-1">
            <TabsTrigger value="all" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">すべて</TabsTrigger>
            <TabsTrigger value="tw-m" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">Mobile</TabsTrigger>
            <TabsTrigger value="tw-mq" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">MQ</TabsTrigger>
            <TabsTrigger value="tw-tt" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">Tabletop</TabsTrigger>
            <TabsTrigger value="tw-frq" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white">Freq</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-[450px] bg-muted rounded-[2rem] animate-pulse" />)}
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {filteredDevices.length === 0 ? (
            <div className="col-span-full text-center py-20 text-muted-foreground">
              該当する機器が見つかりませんでした。
            </div>
          ) : (
            filteredDevices.map((device) => (
              <Card key={device.id} className="overflow-hidden group hover:shadow-2xl transition-all duration-300 border-none shadow-lg bg-white rounded-[2rem]">
                <div className="relative aspect-video overflow-hidden">
                  <Image
                    src={getDeviceImage(device.typeCode) || 'https://picsum.photos/seed/placeholder/600/400'}
                    alt={device.type || ''}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                  <div className="absolute top-4 left-4">
                    {device.status === 'available' ? (
                      <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none flex items-center gap-1 py-1.5 px-4 shadow-lg">
                        <CheckCircle2 className="h-3.5 w-3.5" /> 利用可能
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white border-none flex items-center gap-1 py-1.5 px-4 shadow-lg">
                        <Clock className="h-3.5 w-3.5" /> 予約受付中
                      </Badge>
                    )}
                  </div>
                </div>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 uppercase">{device.typeCode}</Badge>
                    <span className="text-xs text-muted-foreground font-mono">{device.serialNumber}</span>
                  </div>
                  <CardTitle className="font-headline text-2xl group-hover:text-primary transition-colors">{device.type}</CardTitle>
                  <CardDescription className="line-clamp-2">{device.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">月額料金 (12ヶ月〜)</span>
                      <span className="font-bold text-xl text-primary">¥{device.price?.['12m'].monthly.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">/ 月</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/30 p-2 rounded-lg">
                      <Cpu className="h-4 w-4" /> 搭載モジュール: 標準一式 + 特選アプリ
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="bg-secondary/10 p-4">
                  <Link href={`/devices/${device.id}`} className="w-full">
                    <Button className="w-full font-bold h-12 rounded-xl shadow-md group-hover:shadow-primary/20 transition-all" variant={device.status === 'available' ? 'default' : 'outline'}>
                      {device.status === 'available' ? '詳細・お申し込み' : '詳細・空き待ち'}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
