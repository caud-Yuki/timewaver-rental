
'use client';

import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, Calendar, Settings, MessageSquare, AlertCircle } from 'lucide-react';
import { Device } from '@/types';
import Link from 'next/link';

export default function MyDevicesPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();

  const devicesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'devices'), 
      where('currentUserId', '==', user.uid),
      where('status', '==', 'active')
    );
  }, [db, user]);

  const { data: myDevices, loading: devicesLoading } = useCollection<Device>(devicesQuery as any);

  if (authLoading || devicesLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold font-headline">マイページ</h1>
          <p className="text-muted-foreground">現在レンタル中の機器管理</p>
        </div>
        <Link href="/devices">
          <Button className="rounded-xl">新しい機器をレンタルする</Button>
        </Link>
      </div>

      <div className="flex border-b">
        <Button variant="ghost" className="rounded-none px-8 text-primary border-b-2 border-primary">レンタル中の機器</Button>
        <Link href="/mypage/applications">
          <Button variant="ghost" className="rounded-none px-8 text-muted-foreground">申請履歴</Button>
        </Link>
      </div>

      {myDevices.length === 0 ? (
        <Card className="border-dashed border-2 py-20 text-center space-y-4">
          <Package className="mx-auto h-16 w-16 text-muted-foreground opacity-20" />
          <h2 className="text-xl font-bold">レンタル中の機器はありません</h2>
          <p className="text-muted-foreground max-w-xs mx-auto text-sm">
            現在、有効なレンタル契約はありません。まずは機器一覧から体験してみたいTimeWaverを探してみましょう。
          </p>
          <Link href="/devices" className="block">
            <Button variant="outline" className="rounded-xl">機器一覧を見る</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          {myDevices.map((device) => (
            <Card key={device.id} className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white group hover:shadow-primary/5 transition-all">
              <CardHeader className="bg-primary/5 p-8">
                <div className="flex justify-between items-start mb-4">
                  <Badge variant="outline" className="text-primary border-primary/20 bg-white uppercase">{device.typeCode}</Badge>
                  <Badge className="bg-emerald-500">利用中</Badge>
                </div>
                <CardTitle className="text-2xl font-headline group-hover:text-primary transition-colors">{device.type}</CardTitle>
                <CardDescription className="font-mono text-[10px]">{device.serialNumber}</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> 利用開始日
                    </span>
                    <p className="text-sm font-medium">
                      {device.contractStartAt?.seconds ? new Date(device.contractStartAt.seconds * 1000).toLocaleDateString() : '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                      <Settings className="h-3 w-3" /> 保守ステータス
                    </span>
                    <p className="text-sm font-medium text-emerald-600">正常稼働中</p>
                  </div>
                </div>
                
                <div className="bg-secondary/20 p-4 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-normal">
                    レンタル期間の延長やプラン変更は、契約満了の30日前から可能になります。
                  </p>
                </div>
              </CardContent>
              <CardFooter className="bg-secondary/10 p-4 grid grid-cols-2 gap-2">
                <Link href="/mypage/support/ai">
                  <Button variant="ghost" className="w-full rounded-xl gap-2 h-11 text-xs">
                    <MessageSquare className="h-4 w-4" /> AIサポート
                  </Button>
                </Link>
                <Link href="/mypage/support/repair">
                  <Button variant="outline" className="w-full rounded-xl gap-2 h-11 text-xs">
                    修理・相談
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
