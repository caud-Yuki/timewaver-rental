
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Activity, ShieldCheck, CreditCard, Lock, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { PaymentLink, Application } from '@/types';

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const db = useFirestore();
  const paymentLinkId = params.paymentLinkId as string;

  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const linkRef = useMemoFirebase(() => {
    if (!db || !paymentLinkId) return null;
    return doc(db, 'paymentLinks', paymentLinkId);
  }, [db, paymentLinkId]);

  const { data: paymentLink, loading: linkLoading } = useDoc<PaymentLink>(linkRef as any);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !paymentLink) return;

    setIsProcessing(true);

    // Simulate payment processing (FirstPay integration would happen here)
    setTimeout(() => {
      // 1. Update PaymentLink status
      updateDoc(doc(db, 'paymentLinks', paymentLink.id), {
        status: 'used',
        updatedAt: serverTimestamp(),
      });

      // 2. Update Application status
      updateDoc(doc(db, 'applications', paymentLink.applicationId), {
        status: 'completed',
        updatedAt: serverTimestamp(),
      });

      // 3. Update Device status to 'active'
      updateDoc(doc(db, 'devices', paymentLink.deviceId), {
        status: 'active',
        currentUserId: paymentLink.userId,
        contractStartAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setIsProcessing(false);
      setIsCompleted(true);
      toast({
        title: "決済が完了しました",
        description: "ご契約ありがとうございました！TimeWaverの世界をお楽しみください。",
      });
    }, 2500);
  };

  if (linkLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-12 w-12 text-primary" /></div>;

  if (!paymentLink || paymentLink.status !== 'pending') {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Card className="w-full max-w-md p-8 text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-bold">リンクが無効です</h1>
          <p className="text-muted-foreground">
            この決済リンクは既に使用されているか、期限が切れています。
          </p>
          <Button className="w-full" onClick={() => router.push('/')}>トップに戻る</Button>
        </Card>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Card className="w-full max-w-md border-none shadow-2xl rounded-[2.5rem] overflow-hidden text-center p-12 space-y-6">
          <div className="h-20 w-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-12 w-12" />
          </div>
          <h1 className="text-3xl font-bold font-headline">🎉 完了！</h1>
          <p className="text-muted-foreground">
            決済が正常に完了しました。<br />お届けが完了するまで約7営業日かかります。
          </p>
          <Button className="w-full h-14 rounded-2xl text-lg font-bold" onClick={() => router.push('/mypage/devices')}>
            マイページへ移動
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 flex justify-center">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <Activity className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold font-headline">決済手続き</h1>
          <p className="text-muted-foreground">安全な決済システム（FirstPay）で処理されます</p>
        </div>

        <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden">
          <CardHeader className="bg-primary/5 pb-8 pt-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-6 w-6 text-primary" /> カード情報の入力
                </CardTitle>
                <CardDescription>
                  暗号化（RSA）により、お客様のカード情報は保護されます。
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-white">
                ¥{paymentLink.payAmount?.toLocaleString()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="bg-secondary/20 p-4 rounded-xl mb-4">
              <p className="text-xs text-muted-foreground uppercase font-bold mb-1">お支払い内容</p>
              <p className="font-bold">{paymentLink.deviceName}</p>
              <p className="text-sm">{paymentLink.payType === 'monthly' ? '月々払い' : '一括払い'}</p>
            </div>

            <form onSubmit={handlePayment} className="space-y-4">
              <div className="space-y-2">
                <Label>カード番号</Label>
                <div className="relative">
                  <Input placeholder="4242 4242 4242 4242" className="h-12 rounded-xl pl-4 pr-10" required />
                  <div className="absolute right-3 top-3.5 flex gap-1">
                    <div className="w-8 h-5 bg-blue-100 rounded" />
                    <div className="w-8 h-5 bg-orange-100 rounded" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>有効期限 (月/年)</Label>
                  <Input placeholder="MM/YY" className="h-12 rounded-xl" required />
                </div>
                <div className="space-y-2">
                  <Label>セキュリティコード (CVV)</Label>
                  <Input placeholder="123" className="h-12 rounded-xl" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>カード名義人 (英大文字)</Label>
                <Input placeholder="TARO YAMADA" className="h-12 rounded-xl" required />
              </div>

              <div className="pt-4">
                <Button type="submit" className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg" disabled={isProcessing}>
                  {isProcessing ? (
                    <span className="flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> 決済処理中...</span>
                  ) : (
                    '決済を確定する'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
          <CardFooter className="bg-secondary/20 p-6 flex justify-center gap-4 text-[10px] text-muted-foreground uppercase">
            <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Secure SSL</span>
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> PCI DSS Compliant</span>
          </CardFooter>
        </Card>

        <div className="text-center text-xs text-muted-foreground">
          決済リンクID: <span className="font-mono">{paymentLinkId}</span>
        </div>
      </div>
    </div>
  );
}
