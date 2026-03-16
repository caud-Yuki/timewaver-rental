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
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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

  useEffect(() => {
    const checkConfig = async () => {
      if (!db) return;
      const config = await getFirstPayConfig(db);
      if (!config) {
        setConfigError('決済システムの設定が完了していません。管理者にお問い合わせください。');
      }
    };
    checkConfig();
  }, [db]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !paymentLink || !profile || !user || !application) return;

    setIsProcessing(true);
    console.log('[PAYMENT_DEBUG] --- Payment Process Started ---');
    
    try {
      const config = await getFirstPayConfig(db);
      if (!config) throw new Error('決済設定が見つかりません。');

      // 1. Stage 1: Card Tokenization
      console.log('[PAYMENT_DEBUG] Stage 1: Card Tokenization');
      const tokenResult = await createCardToken(config, cardInfo, profile.tel);
      const { cardToken, issuerUrl } = tokenResult;
      
      if (!cardToken) throw new Error('カードトークンの発行に失敗しました。');

      // 2. 3DS Authentication if required
      if (issuerUrl) {
        console.log('[PAYMENT_DEBUG] 3DS Authentication Required:', issuerUrl);
        toast({ title: "本人認証が必要です", description: "別ウィンドウで認証を完了してください。" });
        window.open(issuerUrl, '_blank', 'width=600,height=600');
        const isAuthOk = await poll3dsStatus(config, cardToken);
        if (!isAuthOk) throw new Error('3DS認証に失敗しました。');
      }

      // 3. Stage 2: Member Registration
      console.log('[PAYMENT_DEBUG] Stage 2: Member Registration');
      const customerId = profile.customerId || `CUST-${user.uid.substring(0, 8)}-${Date.now()}`;
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

      // 4. Stage 3: Execution (Charge or Recurring)
      console.log('[PAYMENT_DEBUG] Stage 3: Payment Execution');
      if (paymentLink.payType === 'full') {
        const paymentId = `PAY-${Date.now()}`;
        const chargeResult = await createCharge(config, {
          customerId,
          paymentId,
          paymentName: `Rental: ${paymentLink.deviceName}`,
          amount: paymentLink.payAmount
        });
        transactionId = chargeResult.paymentId;
      } else {
        const recId = `REC-${Date.now()}`;
        const recResult = await createRecurring(config, {
          reccuringId: recId,
          paymentName: `Monthly Rental: ${paymentLink.deviceName}`,
          customerId,
          startAt: new Date().toISOString().split('T')[0],
          payAmount: paymentLink.payAmount,
          currentlyPayAmount: paymentLink.payAmount,
          maxExecutionNumber: application.rentalType,
          recurringDayOfMonth: new Date().getDate() > 28 ? 28 : new Date().getDate()
        });
        recurringId = recResult.reccuringId;
      }

      // 5. Success: Sync to Firestore
      console.log('[PAYMENT_DEBUG] Success! Syncing to Firestore...');
      const subscriptionData = {
        userId: user.uid,
        deviceId: paymentLink.deviceId,
        payType: paymentLink.payType,
        startAt: serverTimestamp(),
        endAt: serverTimestamp(),
        recurringId: recurringId || null,
        paymentId: transactionId || null,
        customerId: customerId,
        payAmount: paymentLink.payAmount,
        status: 'active',
        applicationId: paymentLink.applicationId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      addDoc(collection(db, 'subscriptions'), subscriptionData)
        .catch(() => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'subscriptions', operation: 'create' })));

      updateDoc(doc(db, 'users', user.uid), { customerId, updatedAt: serverTimestamp() })
        .catch(() => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `users/${user.uid}`, operation: 'update' })));

      updateDoc(doc(db, 'paymentLinks', paymentLink.id), { status: 'used', updatedAt: serverTimestamp() })
        .catch(() => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `paymentLinks/${paymentLink.id}`, operation: 'update' })));

      updateDoc(doc(db, 'applications', paymentLink.applicationId), { status: 'completed', updatedAt: serverTimestamp() })
        .catch(() => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `applications/${paymentLink.applicationId}`, operation: 'update' })));

      updateDoc(doc(db, 'devices', paymentLink.deviceId), { status: 'active', currentUserId: user.uid, contractStartAt: serverTimestamp(), updatedAt: serverTimestamp() })
        .catch(() => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `devices/${paymentLink.deviceId}`, operation: 'update' })));

      setIsCompleted(true);
      toast({ title: "決済が完了しました" });
    } catch (error: any) {
      console.error('[PAYMENT_DEBUG] !!! Critical Error in Payment Flow !!!', error);
      toast({
        variant: "destructive",
        title: "決済エラー",
        description: error.message || "お支払い処理に失敗しました。",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (linkLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;

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
          <p className="text-muted-foreground">このリンクは既に使用されているか、期限が切れています。</p>
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
          <p className="text-muted-foreground">決済が正常に完了しました。<br />発送準備を開始いたします。</p>
          <Button className="w-full h-14 rounded-2xl text-lg font-bold" onClick={() => router.push('/mypage/devices')}>マイデバイスへ移動</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 flex justify-center">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <Activity className="h-10 w-10 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold font-headline">決済手続き</h1>
          <p className="text-muted-foreground">安全なFirstPay決済システムで処理されます</p>
        </div>

        <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white">
          <CardHeader className="bg-primary/5 pb-8 pt-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-6 w-6 text-primary" /> カード情報の入力</CardTitle>
                <CardDescription>情報は暗号化され保護されます。</CardDescription>
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
              </div>
            </div>

            <form onSubmit={handlePayment} className="space-y-4">
              <div className="space-y-2">
                <Label>カード番号</Label>
                <Input placeholder="0000 0000 0000 0000" className="h-12 rounded-xl text-lg font-mono" value={cardInfo.cardNo} onChange={e => setCardInfo({...cardInfo, cardNo: e.target.value.replace(/\s/g, '')})} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>有効期限 (月)</Label>
                  <Input placeholder="MM" maxLength={2} className="h-12 rounded-xl" value={cardInfo.expireMonth} onChange={e => setCardInfo({...cardInfo, expireMonth: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label>有効期限 (年)</Label>
                  <Input placeholder="YYYY" maxLength={4} className="h-12 rounded-xl" value={cardInfo.expireYear} onChange={e => setCardInfo({...cardInfo, expireYear: e.target.value})} required />
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
            <div className="flex justify-center gap-6 opacity-50 grayscale">
              <span className="flex items-center gap-1 text-[9px] font-bold"><Lock className="h-3 w-3" /> Secure SSL</span>
              <span className="flex items-center gap-1 text-[9px] font-bold"><ShieldCheck className="h-3 w-3" /> PCI DSS</span>
            </div>
            <p className="text-[10px] text-muted-foreground">カード情報は直接決済システムへ送信され、当サイトには保存されません。</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
