'use client';

import { useState, Suspense, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase, useStorage } from '@/firebase';
import { doc, collection, addDoc, serverTimestamp, query, where, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, ClipboardCheck, ArrowRight, Package, AlertCircle, Camera, FileCheck, Timer, Percent, Mail, UserPlus } from 'lucide-react';
import { Device, UserProfile, GlobalSettings } from '@/types';
import { calculateTotalMonthly, calculateTotalFull } from '@/lib/module-pricing';
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
  const [showWaitlistDialog, setShowWaitlistDialog] = useState(false);
  
  // Track if application was successfully submitted to avoid reverting status on navigation
  const isSubmittedRef = useRef(false);

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

  // Revert device status back to available
  const releaseDeviceLock = useCallback(async () => {
    if (!db || !user || !deviceId || isSubmittedRef.current) return;
    
    // Only release if the current user holds the lock
    const dRef = doc(db, 'devices', deviceId);
    const currentDeviceDoc = await getDocs(query(collection(db, 'devices'), where('__name__', '==', deviceId), where('currentUserId', '==', user.uid)));

    if (!currentDeviceDoc.empty) {
        try {
            await updateDoc(dRef, { 
                status: 'available', 
                currentUserId: null,
                updatedAt: serverTimestamp() 
            });
            console.log('[SESSION] Device released (returned to available)');
        } catch (error) {
            console.error('[SESSION] Error releasing device:', error);
        }
    }
  }, [db, user, deviceId]);

  const handleTimeout = useCallback(() => {
    setShowTimeoutDialog(true);
    releaseDeviceLock();
    
    let count = 10;
    countdownIntervalRef.current = setInterval(() => {
      count -= 1;
      setTimeoutCountdown(count);
      if (count <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        router.push('/');
      }
    }, 1000);
  }, [router, releaseDeviceLock]);

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
        
        if (!isSubmittedRef.current) {
          releaseDeviceLock();
        }
      };
    }
  }, [settings, resetInactivityTimer, releaseDeviceLock]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isSubmittedRef.current) {
        e.preventDefault();
        releaseDeviceLock();
        // Most browsers will show a generic message and not this custom one.
        e.returnValue = 'ページを離れると申し込み中の情報が失われますが、よろしいですか？';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [releaseDeviceLock]);
  
  // Check device status and prompt for waitlist if needed
  useEffect(() => {
    if (!deviceLoading && device) {
      if (device.status !== 'available') {
        if (!user || (device.currentUserId && device.currentUserId !== user.uid)) {
           setShowWaitlistDialog(true);
        }
      } else if (user) {
        // Lock device for current user
        updateDoc(doc(db, 'devices', device.id), { 
          status: 'processing', 
          currentUserId: user.uid, 
          updatedAt: serverTimestamp() 
        });
      }
    }
  }, [device, deviceLoading, user, db]);


  const [formData, setFormData] = useState({
    rentalType: 12,
    payType: 'monthly' as 'monthly' | 'full',
    tel: '',
    zipcode: '',
    prefectureCode: '',
    address1: '',
    address2: '',
    companyName: '',
  });

  // Pre-populate shipping address from user profile
  useEffect(() => {
    if (profile) {
      setFormData(prev => ({
        ...prev,
        tel: prev.tel || profile.tel || '',
        zipcode: prev.zipcode || profile.zipcode || '',
        prefectureCode: prev.prefectureCode || profile.prefectureCode || '',
        address1: prev.address1 || profile.address1 || '',
        address2: prev.address2 || profile.address2 || '',
        companyName: prev.companyName || profile.companyName || '',
      }));
    }
  }, [profile]);

  const moduleBasePrice = settings?.moduleBasePrice || 0;

  const calculateAmount = () => {
    if (!device) return 0;
    const tier = `${formData.rentalType}m` as keyof Device['price'];
    if (formData.payType === 'monthly') {
      return calculateTotalMonthly(device.price[tier].monthly, device.modules, moduleBasePrice);
    } else {
      return calculateTotalFull(device.price[tier].full, device.modules, moduleBasePrice, formData.rentalType);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !storage) return;

    setIsSubmitting(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `id_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `users/${user.uid}/identifications/${fileName}`);
      
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

  const handleAddToWaitlist = async () => {
    if (!user || !device) return;
    setIsSubmitting(true);

    try {
      // Check if user is already on the waitlist for this device type
      const q = query(collection(db, "waitlist"), where("userId", "==", user.uid), where("deviceType", "==", device.type));
      const existingWaitlist = await getDocs(q);

      if (!existingWaitlist.empty) {
        toast({ title: "登録済み", description: "既にこのタイプの機器のキャンセル待ちに登録されています。" });
        router.push('/mypage/waitlist');
        return;
      }

      await addDoc(collection(db, 'waitlist'), {
        userId: user.uid,
        userEmail: user.email,
        userName: profile?.familyName ? `${profile.familyName} ${profile.givenName}` : 'N/A',
        deviceType: device.type,
        status: 'waiting',
        createdAt: serverTimestamp(),
      });
      toast({ title: "キャンセル待ちに登録しました", description: "空きが出たらメールでお知らせします。" });
      router.push('/mypage/waitlist');
    } catch (error: any) {
      toast({ variant: "destructive", title: "登録エラー", description: error.message });
    } finally {
      setIsSubmitting(false);
      setShowWaitlistDialog(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !device || !db) return;
    if (!idFileUploaded) {
      toast({ variant: "destructive", title: "本人確認書類が必要です", description: "身分証明書のアップロードを完了してください。" });
      return;
    }

    setIsSubmitting(true);
    isSubmittedRef.current = true; // Mark as submitted

    // Validate shipping address
    if (!formData.tel || !formData.zipcode || !formData.address1) {
      toast({ variant: "destructive", title: "配送先情報が必要です", description: "電話番号、郵便番号、住所を入力してください。" });
      setIsSubmitting(false);
      return;
    }

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
      // Shipping address (structured)
      shippingTel: formData.tel,
      shippingZipcode: formData.zipcode,
      shippingPrefecture: formData.prefectureCode,
      shippingAddress1: formData.address1,
      shippingAddress2: formData.address2,
      shippingCompanyName: formData.companyName,
      // Legacy fields for backward compatibility
      tel: formData.tel,
      zip: formData.zipcode,
      address: `${formData.address1} ${formData.address2}`.trim(),
      identificationImageUrl: uploadedFileUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Also update user profile with shipping address
    if (user) {
      updateDoc(doc(db, 'users', user.uid), {
        tel: formData.tel,
        zipcode: formData.zipcode,
        prefectureCode: formData.prefectureCode,
        address1: formData.address1,
        address2: formData.address2,
        companyName: formData.companyName,
        updatedAt: serverTimestamp(),
      }).catch(() => {}); // Non-blocking
    }

    try {
      await addDoc(collection(db, 'applications'), applicationData);
      
      // When application is submitted, CLEAR the waitlist for this specific device
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
      isSubmittedRef.current = false; // Revert if submission fails
    } finally {
      setIsSubmitting(false);
    }
  };

  if (deviceLoading || (!device && !showWaitlistDialog)) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;
  if (!deviceId) return <div className="text-center py-20"><AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" /><p>対象の機器が見つかりませんでした。</p></div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      {/* Waitlist Dialog */}
      <Dialog open={showWaitlistDialog} onOpenChange={setShowWaitlistDialog}>
        <DialogContent className="rounded-[2rem] max-w-lg text-center p-12">
          <DialogHeader>
            <div className="h-20 w-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <UserPlus className="h-10 w-10" />
            </div>
            <DialogTitle className="text-2xl font-headline font-bold">キャンセル待ちに登録</DialogTitle>
            <DialogDescription className="text-base py-4 leading-relaxed">
              申し訳ありません、この機器は現在他のユーザーが手続き中です。<br />キャンセル待ちに登録すると、空きが出た際にすぐにメールでお知らせします。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 sm:justify-center gap-4">
            <Button variant="outline" className="rounded-xl h-12 font-bold" onClick={() => router.push('/devices')}>
              他の機器を探す
            </Button>
            <Button className="w-full rounded-xl h-12 font-bold" onClick={handleAddToWaitlist} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : 'キャンセル待ちに登録する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      
      {/* Main Form - Render only if device is available */}
      {device && device.status === 'processing' && device.currentUserId === user?.uid && (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
              <CardHeader className="bg-primary/5 pb-8 pt-10">
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" /> 申請情報の入力</CardTitle>
                  <div className="flex gap-2">
                    {settings && (
                      <Badge variant="outline" className="bg-white text-[10px] flex items-center gap-1 py-1">
                        <Timer className="h-3.3 w-3.3" /> 期限あり
                      </Badge>
                    )}
                    {device.fullPaymentDiscountRate && device.fullPaymentDiscountRate > 0 && (
                      <Badge className="bg-rose-500 text-white text-[10px] py-1 border-none">
                        <Percent className="h-3 w-3 mr-1" /> 一括割引対象
                      </Badge>
                    )}
                  </div>
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
                        <SelectItem value="full">
                          期間分一括払い {device.fullPaymentDiscountRate ? `(${device.fullPaymentDiscountRate}% OFF)` : ''}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {formData.payType === 'full' && device.fullPaymentDiscountRate && (
                      <p className="text-xs text-rose-600 font-bold flex items-center gap-1">
                        <Percent className="h-3 w-3" /> 一括払い特典: 合計金額から {device.fullPaymentDiscountRate}% 割引が適用されています
                      </p>
                    )}
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
                    <Label className="text-base font-bold">配送・請求先情報</Label>
                    {profile?.address1 && (
                      <p className="text-xs text-green-600">会員情報から配送先を読み込みました。変更がある場合は修正してください。</p>
                    )}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="tel">電話番号 <span className="text-red-500">*</span></Label>
                        <Input id="tel" placeholder="090-0000-0000" className="rounded-xl" value={formData.tel} onChange={e => setFormData({...formData, tel: e.target.value})} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zipcode">郵便番号 <span className="text-red-500">*</span></Label>
                        <Input id="zipcode" placeholder="123-4567" className="rounded-xl" value={formData.zipcode} onChange={e => setFormData({...formData, zipcode: e.target.value})} required />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="prefectureCode">都道府県</Label>
                        <Input id="prefectureCode" placeholder="東京都" className="rounded-xl" value={formData.prefectureCode} onChange={e => setFormData({...formData, prefectureCode: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="companyName">会社名（個人の場合は空欄）</Label>
                        <Input id="companyName" placeholder="株式会社〇〇" className="rounded-xl" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address1">市区町村・番地 <span className="text-red-500">*</span></Label>
                      <Input id="address1" placeholder="渋谷区神宮前1-2-3" className="rounded-xl" value={formData.address1} onChange={e => setFormData({...formData, address1: e.target.value})} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address2">建物名・部屋番号</Label>
                      <Input id="address2" placeholder="〇〇ビル 5F" className="rounded-xl" value={formData.address2} onChange={e => setFormData({...formData, address2: e.target.value})} />
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
                      {formData.payType === 'full' && device.fullPaymentDiscountRate && (
                        <span className="text-[10px] text-rose-500 font-bold block mb-1 line-through opacity-50">
                          ¥{(device.price[`${formData.rentalType}m` as keyof Device['price']].monthly * formData.rentalType).toLocaleString()}
                        </span>
                      )}
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
      )}
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
