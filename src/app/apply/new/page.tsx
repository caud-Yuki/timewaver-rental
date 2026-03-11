
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { ShieldCheck, FileUp, ChevronRight, ChevronLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { Device } from '@/types';

export default function NewApplicationPage() {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user } = useUser();
  const db = useFirestore();

  const deviceId = searchParams.get('deviceId');

  const deviceRef = useMemoFirebase(() => {
    if (!db || !deviceId) return null;
    return doc(db, 'devices', deviceId);
  }, [db, deviceId]);

  const { data: device, loading: deviceLoading } = useDoc<Device>(deviceRef as any);

  // Form State
  const [rentalType, setRentalType] = useState<'3' | '6' | '12'>('12');
  const [payType, setPayType] = useState<'monthly' | 'full'>('monthly');
  const [zip, setZip] = useState('');
  const [tel, setTel] = useState('');
  const [address, setAddress] = useState('');

  const nextStep = () => setStep(prev => Math.min(prev + 1, 4));
  const prevStep = () => setStep(prev => Math.max(prev - 1, 1));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db || !device) return;

    setIsSubmitting(true);

    const applicationData = {
      userId: user.uid,
      userEmail: user.email || '',
      deviceId: device.id,
      deviceSerialNumber: device.serialNumber,
      deviceType: device.type,
      rentalType: parseInt(rentalType),
      payType,
      payAmount: payType === 'monthly' ? device.price[rentalType as keyof Device['price']].monthly : device.price[rentalType as keyof Device['price']].full,
      status: 'pending',
      zip,
      tel,
      address,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Correct pattern for Firestore mutations
    addDoc(collection(db, 'applications'), applicationData)
      .then(() => {
        toast({
          title: "申請を受け付けました",
          description: "審査が完了次第、メールにてご連絡いたします（通常1〜3営業日）。",
        });
        router.push('/mypage/devices');
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: 'applications',
          operation: 'create',
          requestResourceData: applicationData,
        });
        errorEmitter.emit('permission-error', permissionError);
        setIsSubmitting(false);
      });
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">お申し込みにはログインが必要です</h1>
        <Link href="/auth/login">
          <Button>ログインする</Button>
        </Link>
      </div>
    );
  }

  if (deviceLoading) {
    return <div className="container mx-auto px-4 py-20 flex justify-center"><Loader2 className="animate-spin h-12 w-12 text-primary" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="mb-12 text-center">
        <h1 className="font-headline text-3xl font-bold mb-4">レンタル利用申し込み</h1>
        <div className="flex items-center justify-between max-w-md mx-auto relative px-2">
          <div className="absolute top-1/2 left-0 w-full h-1 bg-secondary -translate-y-1/2 -z-10"></div>
          <div className={`h-1 absolute top-1/2 left-0 bg-primary transition-all duration-300 -translate-y-1/2 -z-10`} style={{ width: `${(step - 1) * 33.3}%` }}></div>
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-10 w-10 rounded-full flex items-center justify-center font-bold transition-all shadow-md ${
                s <= step ? 'bg-primary text-white scale-110' : 'bg-white text-muted-foreground border-2 border-secondary'
              }`}
            >
              {s < step ? <CheckCircle2 className="h-6 w-6" /> : s}
            </div>
          ))}
        </div>
        <div className="flex justify-between max-w-md mx-auto mt-2 text-xs font-medium text-muted-foreground">
          <span>プラン選択</span>
          <span>詳細情報</span>
          <span>本人確認</span>
          <span>最終確認</span>
        </div>
      </div>

      <Card className="border-none shadow-2xl bg-white rounded-[2rem] overflow-hidden">
        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <CardHeader className="bg-primary/5">
                <CardTitle className="font-headline flex items-center gap-2">
                  <ShieldCheck className="h-6 w-6 text-primary" /> プランの選択
                </CardTitle>
                <CardDescription>ご希望のレンタル期間と支払方法を選択してください</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                <div className="space-y-4">
                  <Label className="text-lg font-bold">契約期間</Label>
                  <RadioGroup value={rentalType} onValueChange={(v) => setRentalType(v as any)} className="grid grid-cols-3 gap-4">
                    {['3', '6', '12'].map((m) => (
                      <Label
                        key={m}
                        className="flex flex-col items-center justify-between rounded-2xl border-2 border-secondary p-4 hover:bg-secondary/20 cursor-pointer transition-all has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                      >
                        <RadioGroupItem value={m} className="sr-only" />
                        <span className="text-xl font-bold">{m}ヶ月</span>
                        <span className="text-xs text-muted-foreground mt-1">{m === '12' ? 'おすすめ' : ''}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
                <div className="space-y-4">
                  <Label className="text-lg font-bold">支払方法</Label>
                  <RadioGroup value={payType} onValueChange={(v) => setPayType(v as any)} className="grid grid-cols-2 gap-4">
                    <Label className="flex flex-col items-center justify-between rounded-2xl border-2 border-secondary p-4 hover:bg-secondary/20 cursor-pointer transition-all has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <RadioGroupItem value="monthly" className="sr-only" />
                      <span className="text-xl font-bold">月々払い</span>
                      <span className="text-xs text-muted-foreground mt-1">負担を抑えて利用</span>
                    </Label>
                    <Label className="flex flex-col items-center justify-between rounded-2xl border-2 border-secondary p-4 hover:bg-secondary/20 cursor-pointer transition-all has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <RadioGroupItem value="full" className="sr-only" />
                      <span className="text-xl font-bold">一括払い</span>
                      <span className="text-xs text-muted-foreground mt-1">ポイント還元対象</span>
                    </Label>
                  </RadioGroup>
                </div>
              </CardContent>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <CardHeader className="bg-primary/5">
                <CardTitle className="font-headline">配送先・詳細情報</CardTitle>
                <CardDescription>機器の配送先とお客様情報を入力してください</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="zip">郵便番号</Label>
                    <Input id="zip" placeholder="123-4567" required className="rounded-xl" value={zip} onChange={(e) => setZip(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tel">電話番号</Label>
                    <Input id="tel" placeholder="090-1234-5678" required className="rounded-xl" value={tel} onChange={(e) => setTel(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">配送先住所</Label>
                  <Input id="address" placeholder="東京都渋谷区..." required className="rounded-xl" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
              </CardContent>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <CardHeader className="bg-primary/5">
                <CardTitle className="font-headline flex items-center gap-2">
                  <FileUp className="h-6 w-6 text-primary" /> 本人確認書類のアップロード
                </CardTitle>
                <CardDescription>運転免許証またはパスポートの写真をアップロードしてください</CardDescription>
              </CardHeader>
              <CardContent className="p-8 text-center">
                <div className="border-2 border-dashed border-secondary rounded-3xl p-12 hover:border-primary/50 transition-colors bg-secondary/5 cursor-pointer flex flex-col items-center group">
                  <FileUp className="h-12 w-12 text-muted-foreground mb-4 group-hover:text-primary transition-colors" />
                  <p className="text-lg font-medium">ここにファイルをドロップ</p>
                  <p className="text-sm text-muted-foreground mt-1">または ファイルを選択 (JPG, PNG, PDF)</p>
                  <Button variant="outline" type="button" className="mt-4 rounded-xl border-secondary">ファイルを選択</Button>
                </div>
              </CardContent>
            </div>
          )}

          {step === 4 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <CardHeader className="bg-primary/5">
                <CardTitle className="font-headline">最終確認</CardTitle>
                <CardDescription>内容をご確認の上、申請を完了してください</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="bg-secondary/20 rounded-2xl p-6 space-y-4">
                  <div className="flex justify-between border-b border-secondary pb-2">
                    <span className="text-muted-foreground">お申し込み機器</span>
                    <span className="font-bold">{device?.type}</span>
                  </div>
                  <div className="flex justify-between border-b border-secondary pb-2">
                    <span className="text-muted-foreground">契約期間</span>
                    <span className="font-bold">{rentalType}ヶ月</span>
                  </div>
                  <div className="flex justify-between border-b border-secondary pb-2">
                    <span className="text-muted-foreground">お支払い方法</span>
                    <span className="font-bold">{payType === 'monthly' ? '月々払い' : '一括払い'}</span>
                  </div>
                  <div className="flex justify-between pt-2">
                    <span className="text-lg font-bold">初回お支払い額（予定）</span>
                    <span className="text-2xl font-bold text-primary">¥{(payType === 'monthly' ? device?.price[rentalType as keyof Device['price']].monthly : device?.price[rentalType as keyof Device['price']].full)?.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="terms" required />
                  <label htmlFor="terms" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    <Link href="/terms" className="text-primary underline">利用規約</Link>および個人情報の取り扱いに同意します
                  </label>
                </div>
              </CardContent>
            </div>
          )}

          <div className="p-8 bg-secondary/10 flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              className={`rounded-xl px-8 ${step === 1 ? 'invisible' : ''}`}
            >
              <ChevronLeft className="mr-2 h-4 w-4" /> 戻る
            </Button>
            {step < 4 ? (
              <Button type="button" onClick={nextStep} className="rounded-xl px-8 shadow-lg">
                次へ <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={isSubmitting} className="rounded-xl px-12 bg-accent hover:bg-accent/90 shadow-lg font-bold text-lg">
                {isSubmitting ? <Loader2 className="animate-spin h-5 w-5" /> : '申請を完了する'}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
