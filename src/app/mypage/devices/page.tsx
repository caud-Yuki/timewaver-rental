
'use client';

import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, Calendar, Settings, MessageSquare, AlertCircle, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { Device, Application, Waitlist } from '@/types';
import Link from 'next/link';

export default function MyDevicesPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();

  // 1. Active Devices
  const devicesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'devices'), 
      where('currentUserId', '==', user.uid),
      where('status', '==', 'active')
    );
  }, [db, user]);
  const { data: myDevices, loading: devicesLoading } = useCollection<Device>(devicesQuery as any);

  // 2. Pending/Approved Applications
  const appsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'applications'),
      where('userId', '==', user.uid),
      where('status', 'in', ['pending', 'approved', 'payment_sent'])
    );
  }, [db, user]);
  const { data: applications, loading: appsLoading } = useCollection<Application>(appsQuery as any);

  // 3. Waitlist Entries
  const waitlistQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'waitlist'),
      where('userId', '==', user.uid),
      where('status', '==', 'waiting')
    );
  }, [db, user]);
  const { data: waitlist, loading: waitlistLoading } = useCollection<Waitlist>(waitlistQuery as any);

  if (authLoading || devicesLoading || appsLoading || waitlistLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  }

  const hasAnyContent = myDevices.length > 0 || applications.length > 0 || waitlist.length > 0;

  return (
    <div className="container mx-auto px-4 py-12 space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-bold font-headline">マイデバイス</h1>
          <p className="text-muted-foreground text-lg">レンタル中の機器と申請状況の確認</p>
        </div>
        <Link href="/devices">
          <Button size="lg" className="rounded-2xl font-bold shadow-lg">新しい機器を探す</Button>
        </Link>
      </div>

      {!hasAnyContent ? (
        <Card className="border-dashed border-2 py-32 text-center space-y-6 rounded-[3rem] bg-secondary/5">
          <Package className="mx-auto h-20 w-20 text-muted-foreground opacity-20" />
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">レンタル・申請履歴がありません</h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              TimeWaverを体験してみましょう。まずは製品ラインナップをご覧ください。
            </p>
          </div>
          <Link href="/devices" className="block">
            <Button variant="outline" className="rounded-2xl h-12 px-8">機器一覧を見る</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-12">
          {/* Active Rentals */}
          {myDevices.length > 0 && (
            <section className="space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" /> 利用中の機器
              </h3>
              <div className="grid md:grid-cols-2 gap-8">
                {myDevices.map((device) => (
                  <Card key={device.id} className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white group">
                    <CardHeader className="bg-primary/5 p-8">
                      <div className="flex justify-between items-start mb-4">
                        <Badge variant="outline" className="text-primary border-primary/20 bg-white uppercase font-bold">{device.typeCode}</Badge>
                        <Badge className="bg-emerald-500 shadow-md">利用中</Badge>
                      </div>
                      <CardTitle className="text-2xl font-headline group-hover:text-primary transition-colors">{device.type}</CardTitle>
                      <CardDescription className="font-mono text-[10px]">{device.serialNumber}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 space-y-6">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> 利用開始日
                          </span>
                          <p className="font-medium">
                            {device.contractStartAt?.seconds ? new Date(device.contractStartAt.seconds * 1000).toLocaleDateString() : '-'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                            <Settings className="h-3 w-3" /> 保守状況
                          </span>
                          <p className="font-medium text-emerald-600">正常稼働中</p>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="bg-secondary/10 p-4 grid grid-cols-3 gap-2">
                      <Link href="/mypage/support/ai">
                        <Button variant="ghost" className="w-full rounded-xl gap-2 h-11 text-xs">
                          <MessageSquare className="h-4 w-4" /> サポート
                        </Button>
                      </Link>
                      <Link href="/mypage/support/repair">
                        <Button variant="outline" className="w-full rounded-xl h-11 text-xs">修理依頼</Button>
                      </Link>
                      <Link href={`/apply/renew?deviceId=${device.id}`}>
                        <Button variant="secondary" className="w-full rounded-xl h-11 text-xs">契約更新</Button>
                      </Link>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Pending Applications */}
          {applications.length > 0 && (
            <section className="space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Clock className="h-6 w-6 text-amber-500" /> 申請・審査中の機器
              </h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {applications.map((app) => (
                  <Card key={app.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white/50 backdrop-blur">
                    <CardHeader className="pb-4">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className="text-[10px] uppercase font-bold">{app.deviceType}</Badge>
                        <Badge variant={app.status === 'payment_sent' ? 'default' : 'secondary'} className={app.status === 'payment_sent' ? 'bg-emerald-500' : ''}>
                          {app.status === 'pending' ? '審査中' : app.status === 'approved' ? '承認済' : '決済待ち'}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg">{app.deviceType}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">申請日</span>
                        <span>{app.createdAt?.seconds ? new Date(app.createdAt.seconds * 1000).toLocaleDateString() : '-'}</span>
                      </div>
                      {app.status === 'payment_sent' && app.paymentLinkId && (
                        <Link href={`/payment/${app.paymentLinkId}`}>
                          <Button className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-bold shadow-lg">
                            今すぐ決済する <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Waitlist */}
          {waitlist.length > 0 && (
            <section className="space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Clock className="h-6 w-6 text-slate-400" /> キャンセル待ち
              </h3>
              <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-6">
                {waitlist.map((item) => (
                  <Card key={item.id} className="border-none shadow-lg rounded-[2rem] bg-slate-50">
                    <CardHeader className="p-6">
                      <Badge variant="secondary" className="w-fit mb-2">待機中</Badge>
                      <CardTitle className="text-md">{item.deviceType}</CardTitle>
                      <CardDescription className="text-[10px]">
                        登録日: {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
