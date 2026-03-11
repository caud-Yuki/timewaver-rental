"use client";

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Activity, Cpu, CheckCircle2, Clock } from 'lucide-react';
import { Device, DeviceTypeCode } from '@/types';

const MOCK_DEVICES: Partial<Device>[] = [
  {
    id: '1',
    serialNumber: 'TW-M-001',
    type: 'TimeWaver Mobile',
    typeCode: 'tw-m',
    status: 'available',
    description: '持ち運びに適したコンパクトなTimeWaver。外出先でのセッションに最適です。',
    price: { "3m": { full: 150000, monthly: 55000 }, "6m": { full: 280000, monthly: 50000 }, "12m": { full: 500000, monthly: 45000 } }
  },
  {
    id: '2',
    serialNumber: 'TW-MQ-002',
    type: 'TimeWaver Mobile Quantum',
    typeCode: 'tw-mq',
    status: 'available',
    description: '量子共鳴機能を強化した最新のモバイルモデル。より深い分析が可能です。',
    price: { "3m": { full: 200000, monthly: 70000 }, "6m": { full: 380000, monthly: 65000 }, "12m": { full: 700000, monthly: 60000 } }
  },
  {
    id: '3',
    serialNumber: 'TW-TT-003',
    type: 'TimeWaver Tabletop',
    typeCode: 'tw-tt',
    status: 'active',
    description: 'クリニックやオフィスでの据え置き利用に最適なハイエンドモデル。',
    price: { "3m": { full: 300000, monthly: 110000 }, "6m": { full: 580000, monthly: 100000 }, "12m": { full: 1000000, monthly: 90000 } }
  },
  {
    id: '4',
    serialNumber: 'TW-FRQ-004',
    type: 'TimeWaver Frequency',
    typeCode: 'tw-frq',
    status: 'available',
    description: '周波数セラピーに特化した専用デバイス。多彩なプログラムを搭載。',
    price: { "3m": { full: 180000, monthly: 65000 }, "6m": { full: 340000, monthly: 60000 }, "12m": { full: 600000, monthly: 55000 } }
  }
];

export default function DeviceListPage() {
  const [filter, setFilter] = useState<string>('all');

  const filteredDevices = MOCK_DEVICES.filter(d => 
    filter === 'all' || d.typeCode === filter
  );

  const getDeviceImage = (code?: DeviceTypeCode) => {
    switch (code) {
      case 'tw-m': return PlaceHolderImages.find(i => i.id === 'tw-mobile')?.imageUrl;
      case 'tw-mq': return PlaceHolderImages.find(i => i.id === 'tw-mq')?.imageUrl;
      case 'tw-tt': return PlaceHolderImages.find(i => i.id === 'tw-tabletop')?.imageUrl;
      case 'tw-frq': return PlaceHolderImages.find(i => i.id === 'tw-frequency')?.imageUrl;
      default: return PlaceHolderImages[0]?.imageUrl;
    }
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col space-y-4 mb-12 items-center text-center">
        <h1 className="font-headline text-4xl font-bold tracking-tight sm:text-5xl">レンタル機器一覧</h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          あなたのニーズに合わせて最適なTimeWaverデバイスをお選びください。
        </p>
      </div>

      <div className="flex justify-center mb-8">
        <Tabs defaultValue="all" className="w-full max-w-2xl" onValueChange={setFilter}>
          <TabsList className="grid w-full grid-cols-5 h-12 rounded-xl bg-secondary/50">
            <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">すべて</TabsTrigger>
            <TabsTrigger value="tw-m" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">Mobile</TabsTrigger>
            <TabsTrigger value="tw-mq" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">MQ</TabsTrigger>
            <TabsTrigger value="tw-tt" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">Tabletop</TabsTrigger>
            <TabsTrigger value="tw-frq" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">Frequency</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {filteredDevices.map((device) => (
          <Card key={device.id} className="overflow-hidden group hover:shadow-xl transition-all border-none shadow-md bg-white rounded-3xl">
            <div className="relative aspect-video overflow-hidden">
              <Image
                src={getDeviceImage(device.typeCode as DeviceTypeCode) || 'https://picsum.photos/seed/placeholder/600/400'}
                alt={device.type || ''}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-4 left-4">
                {device.status === 'available' ? (
                  <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none flex items-center gap-1 py-1 px-3">
                    <CheckCircle2 className="h-3 w-3" /> 利用可能
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white border-none flex items-center gap-1 py-1 px-3">
                    <Clock className="h-3 w-3" /> 利用中 / 待ち
                  </Badge>
                )}
              </div>
            </div>
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5">{device.typeCode?.toUpperCase()}</Badge>
                <span className="text-xs text-muted-foreground font-mono">{device.serialNumber}</span>
              </div>
              <CardTitle className="font-headline text-2xl group-hover:text-primary transition-colors">{device.type}</CardTitle>
              <CardDescription className="line-clamp-2">{device.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">月額料金 (12ヶ月)</span>
                  <span className="font-bold text-lg text-primary">¥{device.price?.['12m'].monthly.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">/ 月</span></span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Cpu className="h-4 w-4" /> 搭載モジュール: 標準搭載一式
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-secondary/20 p-4">
              <Link href={`/devices/${device.id}`} className="w-full">
                <Button className="w-full font-bold h-11 rounded-xl shadow-md group-hover:shadow-primary/20" variant={device.status === 'available' ? 'default' : 'outline'}>
                  {device.status === 'available' ? '詳細・お申し込み' : '詳細を確認'}
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
