
'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase, useStorage } from '@/firebase';
import { collection, query, where, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
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
  ArrowLeft,
  Upload,
  UserCheck,
  Send
} from 'lucide-react';
import { Device, Application, Waitlist, GlobalSettings, Subscription } from '@/types';
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

  // 2b. Archived Applications (canceled/expired)
  const archivedAppsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'applications'),
      where('userId', '==', user.uid),
      where('status', 'in', ['canceled', 'expired'])
    );
  }, [db, user]);
  const { data: archivedApps, loading: archivedLoading } = useCollection<Application>(archivedAppsQuery as any);

  // 3. User's own Waitlist entries
  const waitlistQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'waitlist'),
      where('userId', '==', user.uid),
      where('status', 'in', ['waiting', 'notified', 'scheduled', 'processing'])
    );
  }, [db, user]);
  const { data: waitlist, loading: waitlistLoading } = useCollection<Waitlist>(waitlistQuery as any);

  // 4. All Devices (to check lock/processing status)
  const allDevicesQuery = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'devices');
  }, [db]);
  const { data: allDevices } = useCollection<Device>(allDevicesQuery as any);

  // 5. Active Subscriptions
  const subsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'subscriptions'),
      where('userId', '==', user.uid),
      where('status', '==', 'active')
    );
  }, [db, user]);
  const { data: subscriptions, loading: subsLoading } = useCollection<Subscription>(subsQuery as any);

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

  const handleStartApplication = async (deviceId: string) => {
    if (!db || !user) return;
    
    const dRef = doc(db, 'devices', deviceId);
    
    // Check if someone else already locked it (Double check)
    const targetDevice = allDevices.find(d => d.id === deviceId);
    if (targetDevice?.status === 'processing' && targetDevice.currentUserId !== user.uid) {
      toast({ 
        variant: "destructive", 
        title: "手続き中", 
        description: "現在、他の方がこの機器の申し込み手続きを行っています。" 
      });
      return;
    }

    // LOCK the device at the central device record
    updateDoc(dRef, {
      status: 'processing',
      currentUserId: user.uid,
      updatedAt: serverTimestamp()
    }).then(() => {
      router.push(`/apply/new?deviceId=${deviceId}`);
    });
  };

  const isRenewalEligible = (endAt: any) => {
    if (!settings) return false;
    if (settings.mode === 'test') return true;
    
    if (!endAt) return false;
    const end = endAt.toDate ? endAt.toDate() : new Date(endAt);
    const now = new Date();
    const oneMonthBefore = new Date(end);
    oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1);
    return now >= oneMonthBefore;
  };

  if (authLoading || !user) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;
  }

  if (devicesLoading || appsLoading || waitlistLoading || subsLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;
  }

  const hasAnyContent = myDevices.length > 0 || applications.length > 0 || waitlist.length > 0;

  return (
    <div className="container mx-auto px-4 py-12 space-y-12">
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => router.push('/mypage')}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        マイページに戻る
      </Button>
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
                {myDevices.map((device) => {
                  const subscription = subscriptions.find(s => s.deviceId === device.id);
                  const contractEndAt = subscription?.endAt;
                  const eligible = isRenewalEligible(contractEndAt);

                  return (
                    <Card key={device.id} className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white group">
                      <CardHeader className="bg-primary/5 p-8">
                        <div className="flex justify-between items-start mb-4">
                          <Badge variant="outline" className="text-primary border-primary/20 bg-white uppercase font-bold">{device.typeCode}</Badge>
                          <Badge className="bg-emerald-50 shadow-md">利用中</Badge>
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
                              {contractEndAt?.seconds 
                                ? new Date(contractEndAt.seconds * 1000).toLocaleDateString() 
                                : '未設定'}
                            </p>
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
                        {eligible ? (
                          <Link href={`/apply/renew?deviceId=${device.id}${subscription?.id ? `&subscriptionId=${subscription.id}` : ''}`}>
                            <Button variant="secondary" className="w-full rounded-xl h-11 text-xs font-bold text-primary bg-white hover:bg-primary/5">契約更新</Button>
                          </Link>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="secondary" className="w-full rounded-xl h-11 text-[10px] opacity-50">更新期間外</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>契約更新はまだできません</AlertDialogTitle>
                                <AlertDialogDescription>
                                  契約更新は終了日の1ヶ月前から手続き可能です。
                                  {contractEndAt && (
                                    <>
                                      <br /><br />
                                      更新手続き開始日: <strong>{(() => {
                                        const end = contractEndAt.seconds ? new Date(contractEndAt.seconds * 1000) : new Date(contractEndAt);
                                        const renewFrom = new Date(end);
                                        renewFrom.setMonth(renewFrom.getMonth() - 1);
                                        return renewFrom.toLocaleDateString('ja-JP');
                                      })()}</strong>
                                      <br />
                                      契約終了日: <strong>{contractEndAt.seconds ? new Date(contractEndAt.seconds * 1000).toLocaleDateString('ja-JP') : '-'}</strong>
                                    </>
                                  )}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>閉じる</AlertDialogCancel>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </CardFooter>
                    </Card>
                  );
                })}
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
                {waitlist.map((item) => {
                  const targetDevice = allDevices.find(d => d.id === item.deviceId);
                  const isAvailable = targetDevice?.status === 'available';
                  const isProcessing = targetDevice?.status === 'processing';
                  const isMeProcessing = isProcessing && targetDevice?.currentUserId === user.uid;
                  const isOtherUserProcessing = isProcessing && targetDevice?.currentUserId !== user.uid;

                  return (
                    <Card key={item.id} className={`border-none shadow-lg rounded-[2rem] transition-all ${isAvailable && !isOtherUserProcessing ? 'bg-emerald-50 border-2 border-emerald-200' : 'bg-slate-50'}`}>
                      <CardHeader className="p-6">
                        <div className="flex justify-between items-start mb-2">
                          <Badge 
                            variant={isAvailable || isMeProcessing ? "default" : "secondary"} 
                            className={isAvailable && !isOtherUserProcessing ? "bg-emerald-500 animate-pulse" : ""}
                          >
                            {isAvailable ? "在庫確保！" : isProcessing ? (isMeProcessing ? "手続中" : "受付順番待ち") : "待機中"}
                          </Badge>
                        </div>
                        <CardTitle className="text-md">{item.deviceType}</CardTitle>
                        <CardDescription className="text-[10px]">
                          登録日: {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-6 pb-6 pt-0">
                        {isAvailable ? (
                          <div className="space-y-3">
                            <p className="text-[10px] text-emerald-700 font-bold leading-tight">
                              ご希望の機器に空きが出ました。今すぐお申し込みいただけます。
                            </p>
                            <Button 
                              className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-md font-bold text-xs"
                              onClick={() => handleStartApplication(item.deviceId)}
                            >
                              今すぐ申し込む <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                          </div>
                        ) : isProcessing ? (
                          <div className="space-y-3">
                            {isMeProcessing ? (
                              <>
                                <p className="text-[10px] text-primary font-bold leading-tight">
                                  申し込み手続きを継続してください。
                                </p>
                                <Button 
                                  className="w-full h-10 rounded-xl bg-primary shadow-md font-bold text-xs"
                                  onClick={() => router.push(`/apply/new?deviceId=${item.deviceId}`)}
                                >
                                  順番を待ち (続行) <Clock className="ml-1 h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <p className="text-[10px] text-muted-foreground leading-tight italic">
                                現在、他の方が優先的に手続きを進めています。
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">
                            空きが出次第、こちらに通知ボタンが表示されます。
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Archive Section — canceled/expired rentals */}
      {!archivedLoading && archivedApps && archivedApps.length > 0 && (
        <section className="space-y-6 mt-12">
          <h2 className="text-xl font-bold flex items-center gap-2 text-muted-foreground">
            <Package className="h-5 w-5" />
            過去のレンタル
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-60">
            {archivedApps.map((app) => (
              <Card key={app.id} className="border-none shadow-md rounded-[2rem] bg-gray-50">
                <CardContent className="p-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{app.deviceType}</Badge>
                    <Badge variant={app.status === 'expired' ? 'secondary' : 'destructive'} className="text-xs">
                      {app.status === 'expired' ? '契約満了' : '解約済み'}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{app.deviceType}</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> 利用開始日</span>
                      <span>{app.createdAt?.toDate ? app.createdAt.toDate().toLocaleDateString() : '-'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> 終了日</span>
                      <span>{app.updatedAt?.toDate ? app.updatedAt.toDate().toLocaleDateString() : '-'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
