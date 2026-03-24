'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  addDoc, 
  limit, 
  getDocs, 
  where, 
  writeBatch, 
  Timestamp,
  deleteDoc,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  ShieldAlert, 
  LayoutDashboard, 
  Settings, 
  Users, 
  CreditCard, 
  Package, 
  Ticket, 
  Newspaper, 
  Mail,
  Clock,
  ChevronRight,
  Zap,
  AlertTriangle,
  RefreshCcw,
  Hourglass,
  Search,
  Puzzle
} from 'lucide-react';
import { Application, UserProfile, GlobalSettings, Waitlist, Device } from '@/types';
import Link from 'next/link';

const userProfileConverter: FirestoreDataConverter<UserProfile> = {
    toFirestore: (profile) => {
        const { id, ...data } = profile;
        return data;
    },
    fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): UserProfile => {
        const data = snapshot.data(options);
        return {
            id: snapshot.id,
            email: data.email,
            role: data.role,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
        };
    }
};

const globalSettingsConverter: FirestoreDataConverter<GlobalSettings> = {
    toFirestore: (settings) => settings,
    fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): GlobalSettings => {
        const data = snapshot.data(options);
        return {
            firstpayTest: data.firstpayTest,
            firstpayProd: data.firstpayProd,
            waitlistEmailInterval: data.waitlistEmailInterval,
            waitlistValidityHours: data.waitlistValidityHours,
            applicationSessionMinutes: data.applicationSessionMinutes,
            updatedAt: data.updatedAt,
        };
    }
};

const applicationConverter: FirestoreDataConverter<Application> = {
    toFirestore: (application) => {
        const { id, ...data } = application;
        return data;
    },
    fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): Application => {
        const data = snapshot.data(options);
        return {
            id: snapshot.id,
            userId: data.userId,
            userName: data.userName,
            userEmail: data.userEmail,
            deviceType: data.deviceType,
            rentalPeriod: data.rentalPeriod,
            payType: data.payType,
            status: data.status,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        };
    }
};

const waitlistConverter: FirestoreDataConverter<Waitlist> = {
    toFirestore: (waitlist) => {
        const { id, ...data } = waitlist;
        return data;
    },
    fromFirestore: (snapshot: QueryDocumentSnapshot, options: SnapshotOptions): Waitlist => {
        const data = snapshot.data(options);
        return {
            id: snapshot.id,
            userId: data.userId,
            deviceType: data.deviceType,
            deviceId: data.deviceId,
            status: data.status,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            scheduledNotifyAt: data.scheduledNotifyAt,
        };
    }
};

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useUser();
  const router = useRouter();
  const db = useFirestore();
  const { toast } = useToast();
  const [isReconciling, setIsReconciling] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, authLoading, router]);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid).withConverter(userProfileConverter);
  }, [db, user]);

  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef);

  const settingsRef = useMemoFirebase(() => {
    if (!db || profile?.role !== 'admin') return null;
    return doc(db, 'settings', 'global').withConverter(globalSettingsConverter);
  }, [db, profile?.role]);
  const { data: settings } = useDoc<GlobalSettings>(settingsRef);

  useEffect(() => {
    if (db && profile?.role === 'admin' && settings && !isReconciling) {
      const reconcile = async () => {
        setIsReconciling(true);
        try {
          const now = new Date();
          
          const subQuery = query(
            collection(db, 'subscriptions'),
            where('status', '==', 'active'),
            where('endAt', '<', Timestamp.fromDate(now))
          );
          
          const subSnapshot = await getDocs(subQuery);
          
          if (!subSnapshot.empty) {
            const batch = writeBatch(db);
            const deviceIdsToNotify: string[] = [];
            
            subSnapshot.docs.forEach(subDoc => {
              const subData = subDoc.data();
              batch.update(doc(db, 'subscriptions', subDoc.id), { 
                status: 'completed', 
                updatedAt: serverTimestamp() 
              });
              
              batch.update(doc(db, 'devices', subData.deviceId), { 
                status: 'available', 
                currentUserId: null, 
                contractStartAt: null, 
                contractEndAt: null,
                updatedAt: serverTimestamp() 
              });
              
              deviceIdsToNotify.push(subData.deviceId);
            });

            await batch.commit();

            for (const deviceId of deviceIdsToNotify) {
              const waitlistQuery = query(
                collection(db, 'waitlist'),
                where('deviceId', '==', deviceId),
                where('status', '==', 'waiting')
              ).withConverter(waitlistConverter);
              
              const waitlistSnap = await getDocs(waitlistQuery);
              
              if (!waitlistSnap.empty) {
                const waitlistBatch = writeBatch(db);
                const items = waitlistSnap.docs.map(d => d.data());
                items.sort((a, b) => (a.createdAt.seconds || 0) - (b.createdAt.seconds || 0));
                
                const intervalHours = settings.waitlistEmailInterval || 24;
                const batchNow = new Date();

                items.forEach((item, index) => {
                  const ref = doc(db, 'waitlist', item.id);
                  if (index === 0) {
                    waitlistBatch.update(ref, { status: 'notified', updatedAt: serverTimestamp() });
                  } else {
                    const scheduledTime = new Date(batchNow.getTime() + (index * intervalHours * 60 * 60 * 1000));
                    waitlistBatch.update(ref, {
                      status: 'scheduled',
                      scheduledNotifyAt: Timestamp.fromDate(scheduledTime),
                      updatedAt: serverTimestamp()
                    });
                  }
                });
                await waitlistBatch.commit();
              }
            }

            toast({ 
              title: "契約状況更新", 
              description: `${subSnapshot.size}件の期間満了を確認し、機器を在庫に戻しました。` 
            });
          }

          const waitValidityHours = settings.waitlistValidityHours || 48;
          const wlQuery = query(collection(db, 'waitlist')).withConverter(waitlistConverter);
          const wlSnapshot = await getDocs(wlQuery);
          
          if (!wlSnapshot.empty) {
            const wlByDevice: Record<string, Waitlist[]> = {};
            wlSnapshot.docs.forEach(d => {
              const data = d.data();
              if (data.deviceId) {
                if (!wlByDevice[data.deviceId]) {
                  wlByDevice[data.deviceId] = [];
                }
                wlByDevice[data.deviceId].push(data);
              }
            });

            const devicesToRefresh: string[] = [];

            for (const devId in wlByDevice) {
              const entries = wlByDevice[devId];
              let lastEventTime = 0;
              let allNotified = true;

              entries.forEach(e => {
                const notifyTime = e.scheduledNotifyAt?.seconds || (e.status === 'notified' && e.updatedAt?.seconds) || 0;
                if (notifyTime > lastEventTime) lastEventTime = notifyTime;
                if (e.status === 'waiting') allNotified = false;
              });

              if (allNotified && lastEventTime > 0) {
                const expiryTime = (lastEventTime + (waitValidityHours * 3600)) * 1000;
                if (Date.now() > expiryTime) {
                  devicesToRefresh.push(devId);
                }
              }
            }

            if (devicesToRefresh.length > 0) {
              const cleanupBatch = writeBatch(db);
              let totalDeleted = 0;
              
              wlSnapshot.docs.forEach(docSnap => {
                const deviceId = docSnap.data().deviceId;
                if (deviceId && devicesToRefresh.includes(deviceId)) {
                  cleanupBatch.delete(docSnap.ref);
                  totalDeleted++;
                }
              });

              if (totalDeleted > 0) {
                await cleanupBatch.commit();
                toast({ 
                  title: "待機リストのリフレッシュ", 
                  description: `${devicesToRefresh.length}台の機器で有効期間が終了したため、キャンセル待ちリストを初期化しました。` 
                });
              }
            }
          }

        } catch (err) {
          console.error("Reconciliation Error:", err);
        } finally {
          setIsReconciling(false);
        }
      };
      reconcile();
    }
  }, [db, profile?.role, settings, toast]);

  const applicationsQuery = useMemoFirebase(() => {
    if (!db || profile?.role !== 'admin') return null;
    return query(collection(db, 'applications'), orderBy('createdAt', 'desc'), limit(5)).withConverter(applicationConverter);
  }, [db, profile?.role]);

  const { data: recentApplications, loading: appsLoading } = useCollection<Application>(applicationsQuery);

  const isConfigured = !!(settings?.firstpayTest?.apiKey || settings?.firstpayProd?.apiKey);

  const adminModules = [
    { title: '機器管理', desc: '在庫とステータス', icon: Package, href: '/admin/devices', color: 'text-blue-500', bg: 'bg-blue-50' },
    { title: 'モジュール管理', desc: 'デバイスモジュールの設定', icon: Puzzle, href: '/admin/modules', color: 'text-teal-500', bg: 'bg-teal-50' },
    { title: '申請管理', desc: 'レンタル申込の審査', icon: Users, href: '/admin/applications', color: 'text-purple-500', bg: 'bg-purple-50' },
    { title: '支払管理', desc: '決済状況の確認', icon: CreditCard, href: '/admin/payments', color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { title: '支払データ確認', desc: '決済データの直接確認', icon: Search, href: '/admin/payment-viewer', color: 'text-cyan-500', bg: 'bg-cyan-50' },
    { title: 'キャンセル待ち', desc: '順番待ちのユーザー', icon: Clock, href: '/admin/waitlist', color: 'text-amber-500', bg: 'bg-amber-50' },
    { title: 'クーポン', desc: '割引コードの設定', icon: Ticket, href: '/admin/coupons', color: 'text-rose-500', bg: 'bg-rose-50' },
    { title: 'ニュース', desc: 'お知らせの公開', icon: Newspaper, href: '/admin/news', color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { title: 'メール', desc: 'テンプレート編集', icon: Mail, href: '/admin/email-templates', color: 'text-slate-500', bg: 'bg-slate-50' },
    { title: 'トリガー設定', desc: '自動送信の紐付け', icon: Zap, href: '/admin/email-triggers', color: 'text-orange-500', bg: 'bg-orange-50' },
    { title: '基本設定', desc: 'システム・会社情報', icon: Settings, href: '/admin/settings', color: 'text-gray-500', bg: 'bg-gray-50' },
  ];

  if (authLoading || (profileLoading && !profile)) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!user || profile?.role !== 'admin') {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-6">
        <ShieldAlert className="h-20 w-20 text-destructive mx-auto" />
        <h1 className="text-3xl font-bold font-headline">アクセス制限</h1>
        <p className="text-muted-foreground">管理者権限が必要です。ログインアカウントを確認してください。</p>
        <Link href="/">
          <Button variant="outline" className="rounded-xl">トップページに戻る</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold font-headline flex items-center gap-3">
            <LayoutDashboard className="h-10 w-10 text-primary" /> 管理者ダッシュボード
          </h1>
          <p className="text-muted-foreground">全てのレンタル申請と機器の管理を行っています</p>
        </div>
        {isReconciling && (
          <div className="flex items-center gap-2 text-xs font-medium text-primary animate-pulse bg-primary/5 px-4 py-2 rounded-full border border-primary/20">
            <RefreshCcw className="h-3 w-3 animate-spin" />
            システム状況を同期中...
          </div>
        )}
      </div>

      {!isConfigured && (
        <Card className="border-none shadow-xl bg-amber-50 border-amber-200">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-amber-900">決済設定が未完了です</h3>
                <p className="text-sm text-amber-700">FirstPayのAPIキーが設定されていないため、ユーザーが決済を行うことができません。</p>
              </div>
            </div>
            <Link href="/admin/settings">
              <Button className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl">設定へ移動</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {adminModules.map((module) => (
          <Link key={module.href} href={module.href}>
            <Card className="hover:shadow-xl transition-all duration-300 border-none rounded-3xl group cursor-pointer h-full bg-white">
              <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
                <div className={`p-4 rounded-2xl ${module.bg} ${module.color} group-hover:scale-110 transition-transform`}>
                  <module.icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">{module.title}</h3>
                  <p className="text-[10px] text-muted-foreground">{module.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="border-none shadow-2xl bg-white rounded-[2.5rem] overflow-hidden">
        <CardHeader className="bg-primary/5 p-8 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-headline">直近の申請</CardTitle>
            <CardDescription>対応が必要な申請を優先的に表示しています</CardDescription>
          </div>
          <Link href="/admin/applications">
            <Button variant="ghost" className="rounded-xl">
              すべて見る <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="pl-8">申請日</TableHead>
                <TableHead>ユーザー</TableHead>
                <TableHead>対象機器</TableHead>
                <TableHead>プラン</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right pr-8">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentApplications && recentApplications.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="pl-8 text-xs">{app.createdAt?.seconds ? new Date(app.createdAt.seconds * 1000).toLocaleDateString() : '-'}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{app.userName || '名前なし'}</div>
                    <div className="text-[10px] text-muted-foreground">{app.userEmail}</div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{app.deviceType}</TableCell>
                  <TableCell className="text-xs">{app.rentalPeriod}ヶ月 / {app.payType === 'monthly' ? '月次' : '一括'}</TableCell>
                  <TableCell>
                    <Badge variant={app.status === 'pending' ? 'secondary' : app.status === 'approved' ? 'default' : 'outline'} className="text-[10px]">
                      {app.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <Button size="sm" variant="ghost" className="rounded-lg h-8" asChild>
                      <Link href="/admin/applications">審査へ</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!recentApplications || recentApplications.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">対応が必要な申請はありません</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
