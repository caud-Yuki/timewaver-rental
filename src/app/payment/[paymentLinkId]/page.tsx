
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Activity, ShieldCheck, CreditCard, Lock, Loader2, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { PaymentLink, UserProfile, Application } from '@/types';
import { 
  createCardToken, 
  getFirstPayConfig, 
  poll3dsStatus, 
  registerCustomer, 
  createCharge, 
  createRecurring 
} from '@/lib/firstpay';

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const db = useFirestore();
  const paymentLinkId = params.paymentLinkId as string;

  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [cardInfo, setCardInfo] = useState({
    cardNo: '',
    expireMonth: '',
    expireYear: '',
    holderName: '',
    cvv: '',
  });

  const linkRef = useMemoFirebase(() => {
    if (!db || !paymentLinkId) return null;
    return doc(db, 'paymentLinks', paymentLinkId);
  }, [db, paymentLinkId]);
  const { data: paymentLink, loading: linkLoading } = useDoc<PaymentLink>(linkRef as any);

  const appRef = useMemoFirebase(() => {
    if (!db || !paymentLink?.applicationId) return null;
    return doc(db, 'applications', paymentLink.applicationId);
  }, [db, paymentLink?.applicationId]);
  const { data: application } = useDoc<Application>(appRef as any);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  // Check configuration on load
  useEffect(() => {
    const checkConfig = async () => {
      if (!db) return;
      const config = await getFirstPayConfig(db);
      if (!config || !config.apiKey) {
        setConfigError('決済システムの初期設定が完了していません。管理者にお問い合わせください。');
      }
    };
    checkConfig();
  }, [db]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !paymentLink || !profile || !user || !application) {
      console.warn('[PAYMENT_DEBUG] Data missing for payment:', { db:!!db, link:!!paymentLink, profile:!!profile, user:!!user, app:!!application });
      return;
    }

    console.log('[PAYMENT_DEBUG] --- Payment Process Started ---');
    setIsProcessing(true);

    try {
      // 1. Get FirstPay Config
      const config = await getFirstPayConfig(db);
      if (!config) throw new Error('決済設定が見つかりません。');

      // 2. Tokenize Card (includes RSA encryption internally)
      console.log('[PAYMENT_DEBUG] Stage 1: Card Tokenization');
      const { cardToken, issuerUrl } = await createCardToken(config, cardInfo, profile.tel);
      
      // 3. Handle 3DS if required
      if (issuerUrl) {
        console.log('[PAYMENT_DEBUG] Stage 2: 3DS Authentication Required');
        toast({ title: "本人認証が必要です", description: "別ウィンドウで開かれたカード会社の認証を完了してください。" });
        const authWindow = window.open(issuerUrl, '_blank', 'width=600,height=600');
        const isAuthOk = await poll3dsStatus(config, cardToken);
        if (!isAuthOk) throw new Error('3DS認証に失敗したか、キャンセルされました。');
        if (authWindow) authWindow.close();
        console.log('[PAYMENT_DEBUG] Stage 2: 3DS Auth Passed');
      }

      // 4. Register/Update FirstPay Customer
      console.log('[PAYMENT_DEBUG] Stage 3: Customer Registration');
      const customerId = profile.customerId || `CUST-${user.uid.substring(0, 8)}-${Date.now().toString(36)}`;
      await registerCustomer(config, {
        customerId,
        cardToken,
        familyName: profile.familyName,
        givenName: profile.givenName,
        email: profile.email,
        tel: profile.tel
      });

      let transactionId = '';
      let recurringId = '';

      // 5. Execute Charge (Full) or Recurring (Monthly)
      if (paymentLink.payType === 'full') {
        console.log('[PAYMENT_DEBUG] Stage 4: One-time Charge (Full Pay)');
        const paymentId = `PAY-${Date.now()}`;
        const chargeResult = await createCharge(config, {
          customerId,
          paymentId,
          paymentName: `Full Rental: ${paymentLink.deviceName}`,
          amount: paymentLink.payAmount
        });
        transactionId = chargeResult.paymentId;
      } else {
        console.log('[PAYMENT_DEBUG] Stage 4: Recurring Registration (Monthly Pay)');
        const recId = `REC-${Date.now().toString(36)}`;
        const recResult = await createRecurring(config, {
          reccuringId: recId,
          paymentName: `Monthly Rental: ${paymentLink.deviceName}`,
          customerId,
          startAt: new Date().toISOString().split('T')[0],
          payAmount: paymentLink.payAmount,
          maxExecutionNumber: application.rentalType,
          recurringDayOfMonth: paymentLink.recurringDayOfMonth || 1
        });
        recurringId = recResult.reccuringId;
      }

      // 6. Create Subscription Record
      console.log('[PAYMENT_DEBUG] Stage 5: Recording Subscription in Firestore');
      const subscriptionData = {
        userId: user.uid,
        deviceId: paymentLink.deviceId,
        payType: paymentLink.payType,
        startAt: serverTimestamp(),
        endAt: serverTimestamp(), // Placeholder - calculated by admin on fulfillment
        recurringId: recurringId || null,
        paymentId: transactionId || null,
        customerId: customerId,
        payAmount: paymentLink.payAmount,
        status: 'active',
        applicationId: paymentLink.applicationId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'subscriptions'), subscriptionData);

      // 7. Update User Profile with customer info
      console.log('[PAYMENT_DEBUG] Stage 6: Updating User Profile');
      await updateDoc(doc(db, 'users', user.uid), {
        customerId,
        cardToken,
        updatedAt: serverTimestamp()
      });

      // 8. Update Firestore Statuses
      console.log('[PAYMENT_DEBUG] Stage 7: Final Status Updates');
      await updateDoc(doc(db, 'paymentLinks', paymentLink.id), {
        status: 'used',
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'applications', paymentLink.applicationId), {
        status: 'completed',
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'devices', paymentLink.deviceId), {
        status: 'active',
        currentUserId: user.uid,
        contractStartAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log('[PAYMENT_DEBUG] --- Payment Process Completed Successfully ---');
      setIsCompleted(true);
      toast({ title: "決済が完了しました", description: "ご契約ありがとうございました！" });
    } catch (error: any) {
      console.error('[PAYMENT_DEBUG] !!! Critical Error in Payment Flow !!!', error);
      toast({
        variant: "destructive",
        title: "決済エラー",
        description: error.message || "お支払い処理に失敗しました。カード情報を確認してください。",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (linkLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-12 w-12 text-primary" /></div>;

  if (configError) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Card className="w-full max-w-md p-8 text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold">決済不可</h1>
          <p className="text-muted-foreground">{configError}</p>
          <Button className="w-full" variant="outline" onClick={() => router.push('/mypage')}>マイページに戻る</Button>
        </Card>
      </div>
    );
  }

  if (!paymentLink || paymentLink.status !== 'pending') {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Card className="w-full max-w-md p-8 text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-bold">リンクが無効です</h1>
          <p className="text-muted-foreground">この決済リンクは既に使用されているか、期限が切れています。</p>
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
          <p className="text-muted-foreground">決済が正常に完了しました。<br />デバイスの発送準備を開始いたします。</p>
          <Button className="w-full h-14 rounded-2xl text-lg font-bold" onClick={() => router.push('/mypage/devices')}>マイページへ移動</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 flex justify-center">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4"><Activity className="h-10 w-10 text-primary" /></div>
          <h1 className="text-3xl font-bold font-headline">決済手続き</h1>
          <p className="text-muted-foreground">安全な決済システム（FirstPay）で処理されます</p>
        </div>

        <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white">
          <CardHeader className="bg-primary/5 pb-8 pt-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-6 w-6 text-primary" /> カード情報の入力</CardTitle>
                <CardDescription>暗号化により、お客様のカード情報は保護されます。</CardDescription>
              </div>
              <Badge variant="outline" className="bg-white text-lg py-4 px-4 font-bold">¥{paymentLink.payAmount?.toLocaleString()}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="bg-secondary/20 p-6 rounded-2xl mb-4 border border-secondary">
              <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1 tracking-widest">お支払い内容</p>
              <p className="font-bold text-lg">{paymentLink.deviceName}</p>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary" className="bg-white">{paymentLink.payType === 'monthly' ? '月々払い' : '一括払い'}</Badge>
                {paymentLink.payType === 'monthly' && <Badge variant="secondary" className="bg-white">{application?.rentalType}ヶ月間</Badge>}
              </div>
            </div>

            <form onSubmit={handlePayment} className="space-y-4">
              <div className="space-y-2">
                <Label>カード番号</Label>
                <Input placeholder="4242 4242 4242 4242" className="h-12 rounded-xl text-lg font-mono" value={cardInfo.cardNo} onChange={e => setCardInfo({...cardInfo, cardNo: e.target.value.replace(/\s/g, '')})} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>有効期限 (月)</Label>
                  <Input placeholder="MM (例: 01)" maxLength={2} className="h-12 rounded-xl" value={cardInfo.expireMonth} onChange={e => setCardInfo({...cardInfo, expireMonth: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label>有効期限 (年)</Label>
                  <Input placeholder="YYYY (例: 2028)" maxLength={4} className="h-12 rounded-xl" value={cardInfo.expireYear} onChange={e => setCardInfo({...cardInfo, expireYear: e.target.value})} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">CVV <Info className="h-3 w-3 text-muted-foreground" /></Label>
                  <Input placeholder="123" maxLength={4} className="h-12 rounded-xl font-mono" value={cardInfo.cvv} onChange={e => setCardInfo({...cardInfo, cvv: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label>カード名義人</Label>
                  <Input placeholder="TARO YAMADA" className="h-12 rounded-xl uppercase" value={cardInfo.holderName} onChange={e => setCardInfo({...cardInfo, holderName: e.target.value.toUpperCase()})} required />
                </div>
              </div>
              
              <div className="pt-6">
                <Button type="submit" className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl shadow-primary/20" disabled={isProcessing}>
                  {isProcessing ? <span className="flex items-center gap-2"><Loader2 className="animate-spin h-6 w-6" /> 処理中...</span> : '決済を確定する'}
                </Button>
              </div>
            </form>
          </CardContent>
          <CardFooter className="bg-secondary/20 p-6 flex flex-col gap-4 text-center">
            <div className="flex justify-center gap-6 opacity-50 grayscale hover:grayscale-0 transition-all">
              <span className="flex items-center gap-1 text-[9px] font-bold"><Lock className="h-3 w-3" /> Secure SSL</span>
              <span className="flex items-center gap-1 text-[9px] font-bold"><ShieldCheck className="h-3 w-3" /> PCI DSS Compliant</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              ご入力いただいたカード情報は暗号化され、FirstPay決済システムへ直接送信されます。<br />当サイトのサーバーにカード情報が保存されることはありません。
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
