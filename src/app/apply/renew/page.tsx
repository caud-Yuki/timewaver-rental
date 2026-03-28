
'use client';

import { useState, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase, useStorage } from '@/firebase';
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, ShieldCheck, Camera, FileCheck, Check, ArrowLeft } from 'lucide-react';
import { Device, UserProfile } from '@/types';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';

type PlanDuration = '3m' | '6m' | '12m';
type PayType = 'monthly' | 'full';

interface PlanOption {
  duration: PlanDuration;
  months: number;
  label: string;
}

const PLAN_OPTIONS: PlanOption[] = [
  { duration: '3m', months: 3, label: '3ヶ月' },
  { duration: '6m', months: 6, label: '6ヶ月' },
  { duration: '12m', months: 12, label: '12ヶ月' },
];

function RenewForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const db = useFirestore();
  const storage = useStorage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deviceId = searchParams.get('deviceId');
  const previousSubscriptionId = searchParams.get('subscriptionId');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idFileUploaded, setIdFileUploaded] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string>('');

  // Plan selection state
  const [selectedDuration, setSelectedDuration] = useState<PlanDuration>('12m');
  const [selectedPayType, setSelectedPayType] = useState<PayType>('monthly');

  // Fetch previous subscription to get endAt
  const prevSubRef = useMemoFirebase(() => {
    if (!db || !previousSubscriptionId) return null;
    return doc(db, 'subscriptions', previousSubscriptionId);
  }, [db, previousSubscriptionId]);
  const { data: previousSubscription } = useDoc<any>(prevSubRef as any);

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

  // Price calculation
  const getPrice = () => {
    if (!device?.price?.[selectedDuration]) return { monthly: 0, full: 0, total: 0 };
    const plan = device.price[selectedDuration];
    const months = PLAN_OPTIONS.find(p => p.duration === selectedDuration)?.months || 12;
    return {
      monthly: plan.monthly,
      full: plan.full,
      total: selectedPayType === 'monthly' ? plan.monthly * months : plan.full,
    };
  };

  const price = getPrice();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !storage) return;

    setIsSubmitting(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `renewal_id_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `users/${user.uid}/identifications/${fileName}`);

      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      setUploadedFileUrl(downloadUrl);
      setIdFileUploaded(true);
      toast({ title: "書類をアップロードしました" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "アップロード失敗",
        description: "ファイルのアップロードに失敗しました。"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenew = async () => {
    if (!user || !device || !db) return;
    if (!idFileUploaded) {
      toast({ variant: "destructive", title: "本人確認書類が必要です", description: "更新には最新の身分証明書の提示が必要です。" });
      return;
    }

    setIsSubmitting(true);

    const months = PLAN_OPTIONS.find(p => p.duration === selectedDuration)?.months || 12;

    // Get previous subscription endAt for seamless continuation
    let previousEndAt = null;
    if (previousSubscription?.endAt) {
      const endAt = previousSubscription.endAt;
      previousEndAt = endAt.toDate ? endAt.toDate().toISOString() : (endAt.seconds ? new Date(endAt.seconds * 1000).toISOString() : null);
    }

    const applicationData = {
      userId: user.uid,
      userName: `${profile?.familyName} ${profile?.givenName}`,
      userEmail: user.email,
      deviceId: device.id,
      deviceSerialNumber: device.serialNumber,
      deviceType: device.type,
      rentalType: months,
      payType: selectedPayType,
      payAmount: selectedPayType === 'monthly' ? price.monthly : price.full,
      status: 'pending',
      identificationImageUrl: uploadedFileUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isRenewal: true,
      previousSubscriptionId: previousSubscriptionId || null,
      previousEndAt: previousEndAt,
    };

    addDoc(collection(db, 'applications'), applicationData)
      .then(() => {
        toast({ title: "契約更新の申請を送信しました", description: "管理者による確認後、決済案内をお送りします。" });
        router.push('/mypage/devices');
      })
      .catch(() => {
        toast({ variant: "destructive", title: "エラー", description: "申請の送信に失敗しました。" });
      })
      .finally(() => setIsSubmitting(false));
  };

  if (deviceLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  if (!device) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-2xl text-center">
        <p className="text-muted-foreground">デバイスが見つかりません。</p>
        <Link href="/mypage/devices"><Button variant="outline" className="mt-4">マイデバイスに戻る</Button></Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl space-y-6">
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => router.push('/mypage/devices')}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        マイデバイスに戻る
      </Button>

      <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="bg-primary/5 p-10 text-center">
          <RefreshCw className="mx-auto h-12 w-12 text-primary mb-4" />
          <CardTitle className="text-2xl font-headline">契約更新・プラン変更</CardTitle>
          <CardDescription className="text-base">
            {device.type} の利用期間を延長します
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8 space-y-8">
          {/* Info */}
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>現在の契約満了後も継続してTimeWaverをご利用いただけるよう、更新手続きを行います。</p>
            <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
              <p>更新にあたり、再度本人確認書類の提出をお願いしております。</p>
            </div>
          </div>

          <Separator />

          {/* Plan Selection */}
          <div className="space-y-4">
            <Label className="text-base font-bold">プラン選択</Label>

            {/* Duration */}
            <div className="grid grid-cols-3 gap-3">
              {PLAN_OPTIONS.map((plan) => {
                const isSelected = selectedDuration === plan.duration;
                const planPrice = device.price?.[plan.duration];
                return (
                  <button
                    key={plan.duration}
                    type="button"
                    onClick={() => setSelectedDuration(plan.duration)}
                    className={`relative p-4 rounded-xl border-2 text-center transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute -top-2 -right-2 bg-primary text-white rounded-full p-0.5">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    <div className="text-lg font-bold">{plan.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      ¥{planPrice?.monthly?.toLocaleString()}/月
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pay Type */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedPayType('monthly')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedPayType === 'monthly'
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-bold text-sm">月々払い</div>
                <div className="text-xs text-muted-foreground mt-1">
                  ¥{price.monthly?.toLocaleString()} × {PLAN_OPTIONS.find(p => p.duration === selectedDuration)?.months}回
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPayType('full')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedPayType === 'full'
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-bold text-sm">一括払い</div>
                <div className="text-xs text-muted-foreground mt-1">
                  ¥{price.full?.toLocaleString()}
                </div>
                {device.fullPaymentDiscountRate && (
                  <Badge className="bg-red-500 text-white text-[10px] mt-1">{device.fullPaymentDiscountRate}%OFF</Badge>
                )}
              </button>
            </div>

            {/* Price Summary */}
            <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">お支払い総額</span>
              <span className="text-xl font-bold">¥{price.total?.toLocaleString()}</span>
            </div>
          </div>

          <Separator />

          {/* ID Upload */}
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

            <div className="border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-3 bg-slate-50 transition-colors hover:bg-slate-100">
              {idFileUploaded ? (
                <div className="flex flex-col items-center gap-2 text-emerald-600">
                  <FileCheck className="h-10 w-10" />
                  <p className="text-sm font-bold">書類を受領しました</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setIdFileUploaded(false); fileInputRef.current?.click(); }}>変更する</Button>
                </div>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Camera className="h-5 w-5" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : "ファイルを選択してアップロード"}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">JPG, PNG, PDF (最大 10MB)</p>
                </>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="space-y-3 pt-4">
            <Button
              size="lg"
              className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20"
              onClick={handleRenew}
              disabled={isSubmitting || !idFileUploaded}
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : '更新を申請する'}
            </Button>
            <Link href="/mypage/devices" className="block">
              <Button variant="ghost" className="w-full h-11 rounded-xl">
                キャンセル
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ApplyRenewPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>}>
      <RenewForm />
    </Suspense>
  );
}
