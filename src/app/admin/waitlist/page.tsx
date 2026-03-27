'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, Clock, ChevronRight } from 'lucide-react';
import { Waitlist, Device, waitlistConverter, deviceConverter } from '@/types';

export default function WaitlistPage() {
  const db = useFirestore();

  const devicesQuery = useMemo(() => 
    query(collection(db, 'devices')).withConverter(deviceConverter)
  , [db]);
  const { data: devices, loading: devicesLoading, error: devicesError } = useCollection<Device>(devicesQuery);

  const waitlistQuery = useMemo(() => 
    query(collection(db, 'waitlist'), ).withConverter(waitlistConverter)
  , [db]);
  const { data: waitlist, loading: waitlistLoading, error: waitlistError } = useCollection<Waitlist>(waitlistQuery);

  const waitlistByDevice = useMemo(() => {
    if (!waitlist) return {};
    return waitlist.reduce((acc, item) => {
      const deviceId = item.deviceId;
      if (deviceId) {
        if (!acc[deviceId]) {
          acc[deviceId] = [];
        }
        acc[deviceId].push(item);
      }
      return acc;
    }, {} as Record<string, Waitlist[]>);
  }, [waitlist]);

  const getDeviceStatusBadge = (status: Device['status']) => {
    switch (status) {
      case 'available': return <Badge className="bg-green-500 text-white" variant="default">利用可能(在庫)</Badge>;
      case 'active': return <Badge className="bg-yellow-500 text-white" variant="default">レンタル中</Badge>;
      case 'processing': return <Badge variant="secondary">処理中</Badge>;
      case 'terminated':
      case 'terminated_early':
        return <Badge variant="destructive">契約終了</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const loading = devicesLoading || waitlistLoading;
  const error = devicesError || waitlistError;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold font-headline flex items-center gap-3">
                    <Clock className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                    キャンセル待ち管理
                </h1>
                <p className="text-muted-foreground mt-2">デバイスごとの待機状況一覧</p>
            </div>
        </div>

      {loading && <div className="flex justify-center py-20"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}
      {error && <div className="text-center py-20 text-destructive bg-red-50 border border-red-200 rounded-lg p-6">エラーが発生しました: {error.message}</div>}
      
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {devices?.map((device) => {
            const waitlistCount = waitlistByDevice[device.id]?.length || 0;
            return (
              <Card key={device.id} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out border-slate-200/80">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <Badge variant="outline" className="font-mono text-xs font-medium">{device.typeCode.type.toUpperCase()}</Badge>
                    {getDeviceStatusBadge(device.status)}
                  </div>
                  <div className="pt-4">
                    <CardTitle className="text-xl font-bold font-headline text-slate-800">
                      {device.name}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 pt-1 font-mono">
                      SN: {device.serialNumber}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="py-0">
                  <Link href={`/admin/waitlist/${device.id}`} className="block -mx-6">
                    <div className="bg-slate-50/70 hover:bg-slate-100 transition-colors duration-200 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`flex items-center justify-center h-10 w-10 rounded-full ${waitlistCount > 0 ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-500'}`}>
                                    <User className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-600">キャンセル待ち</p>
                                    <p className={`text-xl font-bold ${waitlistCount > 0 ? 'text-primary' : 'text-slate-700'}`}>
                                      {waitlistCount} <span className="text-sm font-normal text-slate-500">名</span>
                                    </p>
                                </div>
                            </div>
                            <ChevronRight className="h-6 w-6 text-slate-400" />
                        </div>
                    </div>
                  </Link>
                </CardContent>
                <CardFooter className="px-6 py-3 text-center">
                  <p className="text-xs text-slate-400 w-full">クリックして詳細な待機リストを表示</p>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
       {!loading && devices?.length === 0 && (
         <div className="text-center py-24 text-muted-foreground bg-white/50 rounded-2xl">
            <p>登録されているデバイスはありません。</p>
        </div>
      )}
    </div>
  );
}