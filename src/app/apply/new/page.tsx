
'use client';

import { useState, Suspense, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase, useStorage, useCollection } from '@/firebase';
import { doc, collection, addDoc, serverTimestamp, query, where, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, ClipboardCheck, ArrowRight, Package, AlertCircle, Camera, FileCheck, Timer } from 'lucide-react';
import { Device, UserProfile, Waitlist, GlobalSettings } from '@/types';
import Link from 'next/link';

function ApplyForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const db = useFirestore();
  const storage = useStorage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const deviceId = searchParams.get('deviceId');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idFileUploaded, setIdFileUploaded] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string>('');

  // Session Time Logic
  const [showTimeoutDialog, setShowTimeoutDialog] = useState(false);
  const [timeoutCountdown, setTimeoutCountdown] = useState(10);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const deviceRef = useMemoFirebase(() => {
    if (!db || !deviceId) return null;
    return doc(db, 'devices', deviceId);
  }, [db, deviceId]);
  const { data: device, loading: deviceLoading } = useDoc<Device>(deviceRef as any);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const settingsRef = useMemoFirebase(() => {
    if (!db) return null;
    return doc(db, 'settings', 'global');
  }, [db]);
  const { data: settings } = useDoc<GlobalSettings>(settingsRef as any);

  // Check if someone else is processing this device
  const processingQuery = useMemoFirebase(() => {
    if (!db || !deviceId) return null;
    return query(
      collection(db, 'waitlist'),
      where('deviceId', '==', deviceId),
      where('status', '==', 'processing')
    );
  }, [db, deviceId]);
  const { data: processingWaitlist, loading: processingLoading } = useCollection<Waitlist>(processingQuery as any);

  // Revert processing status on timeout
  const revertWaitlistStatus = useCallback(async () => {
    if (!db || !user || !deviceId) return;
    const q = query(
      collection(db, 'waitlist'),
      where('deviceId', '==', deviceId),
      where('userId', '==', user.uid),
      where('status', '==', 'processing')
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.update(d.ref, { status: 'waiting', updatedAt: serverTimestamp() }));
      await batch.commit();
    }
  }, [db, user, deviceId]);

  const handleTimeout = useCallback(() => {
    setShowTimeoutDialog(true);
    revertWaitlistStatus();
    
    let count = 10;
    countdownIntervalRef.current = setInterval(() => {
      count -= 1;
      setTimeoutCountdown(count);
      if (count <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        router.push('/');
      }
    }, 1000);
  }, [router, revertWaitlistStatus]);

  const resetInactivityTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (showTimeoutDialog) return;

    const sessionMinutes = settings?.applicationSessionMinutes || 15;
    timerRef.current = setTimeout(() => {
      handleTimeout();
    }, sessionMinutes * 60 * 1000);
  }, [settings?.applicationSessionMinutes, handleTimeout, showTimeoutDialog]);

  useEffect(() => {
    if (settings) {
      resetInactivityTimer();
      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
      events.forEach(name => window.addEventListener(name, resetInactivityTimer));
      
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        events.forEach(name => window.removeEventListener(name, resetInactivityTimer));
      };
    }
  }, [settings, resetInactivityTimer]);

  useEffect(() => {
    if (!processingLoading && processingWaitlist.length > 0 && user) {
      const someoneElseProcessing = processingWaitlist.some(p => p.userId !== user.uid);
      if (someoneElseProcessing) {
        toast({ 
          variant: "destructive", 
          title: "アクセス制限", 
          description: "現在、他の方がこの機器の申し込み手続きを優先的に行っています。" 
        });
        router.push('/mypage/devices');
      }
    }
  }, [processingWaitlist, processingLoading, user, router, toast]);

  const [formData, setFormData] = useState({
    rentalType: 12,
    payType: 'monthly' as 'monthly' | 'full',
    tel: '',
    zip: '',
    address: '',
  });

  const calculateAmount = () => {
    if (!device) return 0;
    const tier = `${formData.rentalType}m` as keyof Device['price'];
    return formData.payType === 'monthly' ? device.price[tier].monthly : device.price[tier].full;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !storage) return;

    setIsSubmitting(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `id_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `identifications/${user.uid}/${fileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      
      setUploadedFileUrl(downloadUrl);
      setIdFileUploaded(true);
      toast({ title: "書類をアップロードしました" });
    } catch (error: any) {
      console.error("Storage Error:", error);
      toast({ 
        variant: "destructive", 
        title: "アップロード失敗", 
        description: "ファイルのアップロードに失敗しました。" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !device || !db) return;
    if (!idFileUploaded) {
      toast({ variant: "destructive", title: "本人確認書類が必要です", description: "身分証明書のアップロードを完了してください。" });
      return;
    }

    setIsSubmitting(true);

    const applicationData = {
      userId: user.uid,
      userName: `${profile?.familyName} ${profile?.givenName}`,
      userEmail: user.email,
      deviceId: device.id,
      deviceSerialNumber: device.serialNumber,
      deviceType: device.type,
      rentalType: formData.rentalType,
      payType: formData.payType,
      payAmount: calculateAmount(),
      status: 'pending',
      tel: formData.tel || profile?.tel || '',
      zip: formData.zip || profile?.zipcode || '',
      address: formData.address || profile?.address1 || '',
      identificationImageUrl: uploadedFileUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'applications'), applicationData);
      
      const waitlistQuery = query(collection(db, 'waitlist'), where('deviceId', '==', device.id));
      const waitlistSnap = await getDocs(waitlistQuery);
      
      if (!waitlistSnap.empty) {
        const batch = writeBatch(db);
        waitlistSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      toast({ title: "申請を送信しました", description: "管理者による審査をお待ちください（1〜3営業日）" });
      router.push('/mypage/applications');
    } catch (error: any) {
      toast({ variant: "destructive", title: "エラー", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (deviceLoading || processingLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;
  if (!deviceId || !device) return <div className="text-center py-20"><AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" /><p>対象の機器が見つかりませんでした。</p></div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="mb-12 text-center space-y-4">
        <h1 className="text-4xl font-bold font-headline">レンタル利用申請</h1>
        <p className="text-muted-foreground">選択された機器の審査・配送手続きを開始します</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
            <CardHeader className="bg-primary/5 pb-8 pt-10">
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" /> 申請情報の入力</CardTitle>
                {settings && (
                  <Badge variant="outline" className="bg-white text-[10px] flex items-center gap-1 py-1">
                    <Timer className="h-3.3 w-3.3" /> 期限あり
                  </Badge>
                )}
              </div>
              <CardDescription>契約期間と支払い方法を選択してください</CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="space-y-4">
                  <Label className="text-base font-bold">レンタル期間</Label>
                  <RadioGroup 
                    defaultValue="12" 
                    onValueChange={(v) => setFormData({...formData, rentalType: parseInt(v)})}
                    className="grid grid-cols-3 gap-4"
                  >
                    {[3, 6, 12].map((m) => (
                      <div key={m}>
                        <RadioGroupItem value={m.toString()} id={`r${m}`} className="peer sr-only" />
                        <Label
                          htmlFor={`r${m}`}
                          className="flex flex-col items-center justify-between rounded-2xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 transition-all cursor-pointer"
                        >
                          <span className="text-sm font-bold">{m}ヶ月</span>
                          <span className="text-xs text-muted-foreground">¥{device.price[`${m}m` as keyof Device['price']].monthly.toLocaleString()}/月</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div className="space-y-4">
                  <Label className="text-base font-bold">お支払い方法</Label>
                  <Select 
                    value={formData.payType} 
                    onValueChange={(v: any) => setFormData({...formData, payType: v})}
                  >
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="支払い方法を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">月々払い（クレジットカード）</SelectItem>
                      <SelectItem value="full">期間分一括払い</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-4">
                  <Label className="text-base font-bold">本人確認書類の提出</Label>
                  <p className="text-xs text-muted-foreground">運転免許証、パスポート、マイナンバーカードのいずれかをアップロードしてください。</p>
                  
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef} 
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                  />

                  <div className="border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 bg-slate-50 transition-colors hover:bg-slate-100">
                    {idFileUploaded ? (
                      <div className="flex flex-col items-center gap-2 text-emerald-600">
                        <FileCheck className="h-12 w-12" />
                        <p className="text-sm font-bold">書類を受領しました</p>
                        <Button type="button" variant="ghost" size="sm" onClick={() => { setIdFileUploaded(false); fileInputRef.current?.click(); }}>変更する</Button>
                      </div>
                    ) : (
                      <>
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <Camera className="h-6 w-6" />
                        </div>
                        <div className="text-center">
                          <Button 
                            type="button" 
                            variant="outline" 
                            className="rounded-xl mb-2" 
                            onClick={() => fileInputRef.current?.click()} 
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : "ファイルを選択してアップロード"}
                          </Button>
                          <p className="text-[10px] text-muted-foreground">JPG, PNG, PDF (最大 10MB)</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <Label className="text-base font-bold">配送・ご連絡先情報</Label>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="zip">郵便番号</Label>
                      <Input id="zip" placeholder="123-4567" className="rounded-xl" value={formData.zip} onChange={e => setFormData({...formData, zip: e.target.value})} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tel">電話番号</Label>
                      <Input id="tel" placeholder="090-0000-0000" className="rounded-xl" value={formData.tel} onChange={e => setFormData({...formData, tel: e.target.value})} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">配送先住所</Label>
                    <Input id="address" placeholder="東京都...市区町村...番地" className="rounded-xl" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} required />
                  </div>
                </div>

                <Button type="submit" size="lg" className="w-full h-14 rounded-2xl text-lg font-bold shadow-xl" disabled={isSubmitting || !idFileUploaded}>
                  {isSubmitting ? <Loader2 className="animate-spin" /> : '利用規約に同意して申請する'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-none shadow-lg rounded-[2.5rem] bg-secondary/20 sticky top-24">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">お申し込み内容</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-4 items-center">
                <div className="h-16 w-16 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                  <Package className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold">{device.type}</h4>
                  <p className="text-[10px] text-muted-foreground font-mono">{device.serialNumber}</p>
                </div>
              </div>
              
              <Separator className="bg-white/50" />
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">プラン</span>
                  <span className="font-bold">{formData.rentalType}ヶ月 / {formData.payType === 'monthly' ? '月次' : '一括'}</span>
                </div>
                <div className="flex justify-between items-end mt-4">
                  <span className="text-sm font-bold">お支払い合計金額</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-primary">¥{calculateAmount().toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground block">
                      {formData.payType === 'monthly' ? '(初回分)' : '(全額分)'} (税込)
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white/50 p-4 rounded-2xl space-y-2 text-[10px] text-muted-foreground">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span>審査承認後に決済リンクをお送りします。</span>
                </div>
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />
                  <span>配送は決済完了後、通常7営業日以内に行われます。</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Timeout Dialog */}
      <Dialog open={showTimeoutDialog} onOpenChange={() => {}}>
        <DialogContent className="rounded-[2rem] max-w-md text-center p-12">
          <DialogHeader>
            <div className="h-20 w-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Timer className="h-10 w-10 animate-pulse" />
            </div>
            <DialogTitle className="text-2xl font-headline font-bold">セッション終了</DialogTitle>
            <DialogDescription className="text-base py-4 leading-relaxed">
              一定時間操作がなかったため、セキュリティ上の理由によりセッションを終了しました。<br />
              確保していた優先枠を解除します。
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6">
            <p className="text-sm font-bold text-muted-foreground mb-4">
              あと <span className="text-primary text-xl px-1">{timeoutCountdown}</span> 秒でトップページに戻ります
            </p>
            <Button className="w-full rounded-xl h-12 font-bold" onClick={() => router.push('/')}>
              今すぐトップに戻る
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ApplyNewPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>}>
      <ApplyForm />
    </Suspense>
  );
}
