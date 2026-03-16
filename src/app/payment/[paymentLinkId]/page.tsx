'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, ShieldCheck, CreditCard, Lock, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { PaymentLink, UserProfile, Application } from '@/types';
import {
  getFirstPayConfig,
  initWidget,
  publishWidgetToken,
  poll3dsStatus,
  registerCustomer,
  createCharge,
  createRecurring,
  FirstPayConfig,
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
  const [widgetReady, setWidgetReady] = useState(false);

  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const configRef = useRef<FirstPayConfig | null>(null);

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

  const initializeWidget = useCallback(async () => {
    if (!db || !widgetContainerRef.current || widgetRef.current) return;

    try {
      const config = await getFirstPayConfig(db);
      if (!config) {
        setConfigError('決済システムの設定が完了していません。管理者にお問い合わせください。');
        return;
      }
      configRef.current = config;

      const apiCredential = config.bearerToken.replace(/^Bearer\s+/i, '').trim();

      const widget = await initWidget(
        widgetContainerRef.current,
        apiCredential,
        config.mode,
        profile?.tel,
      );

      widget.subscribe((errors: Record<string, string>) => {
        console.log('[PAYMENT_DEBUG] Widget validation callback:', errors);
      });

      widgetRef.current = widget;
      setWidgetReady(true);
    } catch (error: any) {
      console.error('[PAYMENT_DEBUG] Widget initialization failed:', error);
      setConfigError(`ウィジェットの初期化に失敗しました: ${error.message}`);
    }
  }, [db, profile?.tel]);

  useEffect(() => {
    initializeWidget();
  }, [initializeWidget]);

  const handlePayment = async () => {
    if (!db || !paymentLink || !profile || !user || !application) return;
    if (!widgetRef.current) {
      toast({ variant: 'destructive', title: 'エラー', description: 'カード入力ウィジェットが初期化されていません。' });
      return;
    }

    setIsProcessing(true);

    try {
      const config = configRef.current;
      if (!config) throw new Error('決済設定が見つかりません。');

      const tokenResult = await publishWidgetToken(widgetRef.current, profile.tel);
      const { cardToken } = tokenResult;

      const customerId = profile.customerId || `CUST-${user.uid.substring(0, 8)}-${Date.now()}`;

      try {
        await registerCustomer(config, {
          customerId,
          cardToken,
          familyName: profile.familyName,
          givenName: profile.givenName,
          email: profile.email,
          tel: profile.tel,
        });
      } catch (regError: any) {
        if (!regError.message?.includes('登録済み')) {
          throw regError;
        }
      }

      let transactionId = '';
      let recurringId = '';

      if (paymentLink.payType === 'full') {
        const paymentId = `PAY${Date.now()}`;
        const chargeResult = await createCharge(config, {
          customerId,
          paymentId,
          paymentName: `Rental: ${paymentLink.deviceName}`,
          amount: paymentLink.payAmount,
        });
        transactionId = chargeResult.paymentId;
      } else {
        const recId = `REC${Date.now()}`;
        const recResult = await createRecurring(config, {
          reccuringId: recId,
          paymentName: `Monthly Rental: ${paymentLink.deviceName}`,
          customerId,
          startAt: new Date().toISOString().split('T')[0],
          payAmount: paymentLink.payAmount,
          currentlyPayAmount: paymentLink.payAmount,
          maxExecutionNumber: application.rentalType,
          recurringDayOfMonth: new Date().getDate() > 28 ? 28 : new Date().getDate(),
        });
        recurringId = recResult.reccuringId;
      }

      setIsCompleted(true);
      toast({ title: '決済が完了しました' });

      // Calculate End Date based on rentalType
      const now = new Date();
      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + application.rentalType);

      const subscriptionData = {
        userId: user.uid,
        deviceId: paymentLink.deviceId,
        payType: paymentLink.payType,
        startAt: serverTimestamp(),
        endAt: endDate,
        recurringId: recurringId || null,
        paymentId: transactionId || null,
        customerId: customerId,
        payAmount: paymentLink.payAmount,
        status: 'active',
        applicationId: paymentLink.applicationId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      Promise.allSettled([
        addDoc(collection(db, 'subscriptions'), subscriptionData),
        updateDoc(doc(db, 'users', user.uid), { customerId, updatedAt: serverTimestamp() }),
        updateDoc(doc(db, 'paymentLinks', paymentLink.id), { status: 'used', updatedAt: serverTimestamp() }),
        updateDoc(doc(db, 'applications', paymentLink.applicationId), { status: 'completed', updatedAt: serverTimestamp() }),
        updateDoc(doc(db, 'devices', paymentLink.deviceId), { 
          status: 'active', 
          currentUserId: user.uid, 
          contractStartAt: serverTimestamp(),
          contractEndAt: endDate,
          updatedAt: serverTimestamp() 
        }),
      ]).then((results) => {
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            console.warn(`[PAYMENT_DEBUG] Firestore write #${i} failed:`, r.reason?.message);
          }
        });
      });
    } catch (error: any) {
      console.error('[PAYMENT_DEBUG] !!! Critical Error in Payment Flow !!!', error);
      toast({
        variant: 'destructive',
        title: '決済エラー',
        description: error.message || 'お支払い処理に失敗しました。',
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

            <div className="space-y-4">
              <div
                id="firstpay-widget-container"
                ref={widgetContainerRef}
                className="min-h-[280px] rounded-xl"
              >
                {!widgetReady && (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                    <Loader2 className="animate-spin h-6 w-6 mr-2" />
                    カード入力フォームを読み込み中...
                  </div>
                )}
              </div>
            </div>

            <div className="pt-6">
              <Button
                type="button"
                className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl shadow-primary/20"
                disabled={isProcessing || !widgetReady}
                onClick={handlePayment}
              >
                {isProcessing
                  ? <span className="flex items-center gap-2"><Loader2 className="animate-spin h-6 w-6" /> 処理中...</span>
                  : '決済を確定する'
                }
              </Button>
            </div>
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