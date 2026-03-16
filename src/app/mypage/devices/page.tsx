
'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase, useStorage } from '@/firebase';
import { collection, query, where, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  Package, 
  Calendar, 
  Settings, 
  MessageSquare, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  Upload,
  UserCheck
} from 'lucide-react';
import { Device, Application, Waitlist, GlobalSettings } from '@/types';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function MyDevicesPage() {
  const { user, loading: authLoading } = useUser();
  const router = useRouter();
  const db = useFirestore();
  const storage = useStorage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, authLoading, router]);

  // Settings for Mode check
  const settingsRef = useMemoFirebase(() => {
    if (!db) return null;
    return doc(db, 'settings', 'global');
  }, [db]);
  const { data: settings } = useDoc<GlobalSettings>(settingsRef as any);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !storage || !selectedAppId || !db) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `id_retry_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `identifications/${user.uid}/${fileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      
      await updateDoc(doc(db, 'applications', selectedAppId), {
        identificationImageUrl: downloadUrl,
        updatedAt: serverTimestamp()
      });

      toast({ title: "本人確認書類をアップロードしました" });
      setSelectedAppId(null);
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "アップロード失敗", 
        description: "ファイルのアップロードに失敗しました。" 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const isRenewalEligible = (device: Device) => {
    if (!settings) return false;
    if (settings.mode === 'test') return true;
    
    if (!device.contractEndAt) return false;
    const end = device.contractEndAt.toDate();
    const now = new Date();
    const oneMonthBefore = new Date(end);
    oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1);
    
    return now >= oneMonthBefore;
  };

  if (authLoading || !user) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;
  }

  if (devicesLoading || appsLoading || waitlistLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;
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

      <input 
        type="file" 
        className="hidden" 
        ref={fileInputRef} 
        accept="image/*,application/pdf"
        onChange={handleFileUpload}
      />

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
                          <span className="text-[10px] text-destructive uppercase font-bold flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> 利用終了日
                          </span>
                          <p className="font-medium text-destructive">
                            {device.contractEndAt?.seconds ? new Date(device.contractEndAt.seconds * 1000).toLocaleDateString() : '未設定'}
                          </p>
                        </div>
                        <div className="space-y-1 col-span-2 pt-2">
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
                      {isRenewalEligible(device) ? (
                        <Link href={`/apply/renew?deviceId=${device.id}`}>
                          <Button variant="secondary" className="w-full rounded-xl h-11 text-xs font-bold text-primary bg-white hover:bg-primary/5">契約更新</Button>
                        </Link>
                      ) : (
                        <Button variant="secondary" disabled className="w-full rounded-xl h-11 text-[10px] opacity-50">更新期間外</Button>
                      )}
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

                      {!app.identificationImageUrl && app.status === 'pending' && (
                        <div className="bg-red-50 border border-red-100 p-4 rounded-2xl space-y-3">
                          <div className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-[10px] font-bold">本人確認書類が未提出です</span>
                          </div>
                          <Button 
                            className="w-full h-10 rounded-xl bg-red-500 hover:bg-red-600 text-xs font-bold shadow-sm"
                            disabled={isUploading && selectedAppId === app.id}
                            onClick={() => { setSelectedAppId(app.id); fileInputRef.current?.click(); }}
                          >
                            {isUploading && selectedAppId === app.id ? <Loader2 className="animate-spin h-3 w-3 mr-2" /> : <Upload className="h-3 w-3 mr-2" />}
                            書類をアップロード
                          </Button>
                        </div>
                      )}

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
