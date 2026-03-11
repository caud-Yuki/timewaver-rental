
'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Device, UserProfile } from '@/types';
import Link from 'next/link';

function RenewForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const deviceId = searchParams.get('deviceId');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleRenew = async () => {
    if (!user || !device || !db) return;
    setIsSubmitting(true);

    const applicationData = {
      userId: user.uid,
      userName: `${profile?.familyName} ${profile?.givenName}`,
      userEmail: user.email,
      deviceId: device.id,
      deviceSerialNumber: device.serialNumber,
      deviceType: device.type,
      rentalType: 12, // Default extension to 12m for renewal
      payType: 'monthly',
      payAmount: device.price['12m'].monthly,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isRenewal: true
    };

    addDoc(collection(db, 'applications'), applicationData)
      .then(() => {
        toast({ title: "契約更新の申請を送信しました", description: "管理者による確認後、決済案内をお送りします。" });
        router.push('/mypage/devices');
      })
      .finally(() => setIsSubmitting(false));
  };

  if (deviceLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-20 max-w-2xl text-center">
      <Card className="border-none shadow-2xl rounded-[3rem] overflow-hidden bg-white">
        <CardHeader className="bg-primary/5 p-12">
          <RefreshCw className="mx-auto h-16 w-16 text-primary mb-6" />
          <CardTitle className="text-3xl font-headline">契約更新・プラン変更</CardTitle>
          <CardDescription className="text-lg">
            {device?.type} の利用期間を延長します
          </CardDescription>
        </CardHeader>
        <CardContent className="p-12 space-y-8">
          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>現在の契約満了後も継続してTimeWaverをご利用いただけるよう、更新手続きを行います。</p>
            <div className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl flex items-start gap-3 text-left">
              <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
              <p>更新申請後、審査を経て新しい決済リンクを発行いたします。決済完了をもって契約期間が更新されます。</p>
            </div>
          </div>

          <div className="space-y-4">
            <Button 
              size="lg" 
              className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl shadow-primary/20" 
              onClick={handleRenew}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : '更新を申請する'}
            </Button>
            <Link href="/mypage/devices" className="block">
              <Button variant="ghost" className="w-full h-12 rounded-xl">
                マイページに戻る
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
