'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Activity, Clock, FileText, Settings, HelpCircle, ChevronRight, AlertCircle } from 'lucide-react';
import { Application } from '@/types';

export default function MyDevicesPage() {
  const { user } = useUser();
  const db = useFirestore();

  const applicationsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'applications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
  }, [db, user]);

  const { data: applications, loading } = useCollection<Application>(applicationsQuery as any);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-8" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-64 bg-muted rounded-3xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const activeRentals = applications.filter(app => app.status === 'approved' || app.status === 'payment_sent');
  const pendingApps = applications.filter(app => app.status === 'pending');

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-12">
        <div>
          <h1 className="font-headline text-3xl font-bold">マイページ</h1>
          <p className="text-muted-foreground">レンタル中の機器と申請状況を確認できます</p>
        </div>
        <Link href="/devices">
          <Button className="rounded-xl shadow-lg">
            新しい機器をレンタルする
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="rentals" className="space-y-8">
        <TabsList className="bg-secondary/50 p-1 rounded-xl h-12">
          <TabsTrigger value="rentals" className="rounded-lg px-8 h-10 data-[state=active]:bg-primary data-[state=active]:text-white">
            レンタル中の機器
          </TabsTrigger>
          <TabsTrigger value="applications" className="rounded-lg px-8 h-10 data-[state=active]:bg-primary data-[state=active]:text-white">
            申請履歴
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rentals" className="space-y-6">
          {activeRentals.length === 0 ? (
            <Card className="border-dashed border-2 bg-secondary/5 rounded-3xl p-12 text-center">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">現在レンタル中の機器はありません</h3>
              <p className="text-muted-foreground mb-6">TimeWaverの驚異的なテクノロジーを体験してみませんか？</p>
              <Link href="/devices">
                <Button variant="outline" className="rounded-xl">機器一覧を見る</Button>
              </Link>
            </Card>
          ) : (
            <div className="grid gap-8 lg:grid-cols-2">
              {activeRentals.map((app) => (
                <Card key={app.id} className="overflow-hidden border-none shadow-xl bg-white rounded-3xl">
                  <div className="flex flex-col sm:flex-row">
                    <div className="relative w-full sm:w-48 aspect-square sm:aspect-auto">
                      <Image
                        src="https://picsum.photos/seed/device/400/400"
                        alt="Device"
                        fill
                        className="object-cover"
                        data-ai-hint="medical device"
                      />
                    </div>
                    <div className="flex-1 p-6">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 uppercase">
                          {app.deviceType}
                        </Badge>
                        <Badge className="bg-emerald-500">利用中</Badge>
                      </div>
                      <h3 className="text-xl font-bold mb-1">TimeWaver {app.deviceType}</h3>
                      <p className="text-xs text-muted-foreground mb-4">S/N: {app.deviceSerialNumber}</p>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">契約期間</span>
                          <span className="font-medium">{app.rentalType}ヶ月</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">利用期間</span>
                            <span className="font-medium">残り 120日</span>
                          </div>
                          <Progress value={66} className="h-1.5" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <CardFooter className="bg-secondary/20 p-4 grid grid-cols-3 gap-2">
                    <Button variant="ghost" size="sm" className="rounded-lg flex flex-col h-auto py-2 gap-1">
                      <Settings className="h-4 w-4" />
                      <span className="text-[10px]">設定</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="rounded-lg flex flex-col h-auto py-2 gap-1">
                      <HelpCircle className="h-4 w-4" />
                      <span className="text-[10px]">使い方</span>
                    </Button>
                    <Link href="/mypage/support/ai" className="w-full">
                      <Button variant="ghost" size="sm" className="rounded-lg flex flex-col w-full h-auto py-2 gap-1">
                        <Activity className="h-4 w-4" />
                        <span className="text-[10px]">AIサポート</span>
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="applications" className="space-y-6">
          <div className="space-y-4">
            {applications.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">申請履歴はありません。</div>
            ) : (
              applications.map((app) => (
                <Card key={app.id} className="border-none shadow-md bg-white rounded-2xl overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="p-6 flex flex-col sm:flex-row items-center gap-6">
                    <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <h4 className="font-bold">レンタル申し込み: {app.deviceType}</h4>
                      <p className="text-sm text-muted-foreground">申請日: {new Date(app.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {app.status === 'pending' && <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">審査中</Badge>}
                      {app.status === 'approved' && <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">承認済み</Badge>}
                      {app.status === 'rejected' && <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-200">却下</Badge>}
                      <Button variant="ghost" size="icon" className="rounded-full">
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Info Banner */}
      <Card className="mt-12 border-none shadow-lg bg-primary/5 rounded-3xl overflow-hidden">
        <CardContent className="p-8 flex items-center gap-6">
          <div className="h-16 w-16 rounded-3xl bg-primary flex items-center justify-center shrink-0">
            <AlertCircle className="h-8 w-8 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">ご案内</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              現在、TimeWaverの最新アップデートが提供されています。レンタル中の機器は自動的に反映されます。
              操作方法についてご不明点がある場合は、AIコンシェルジュにお気軽にご相談ください。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
