
'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Clock, CheckCircle2, Package } from 'lucide-react';
import { Device, UserProfile } from '@/types';
import Link from 'next/link';

function WaitlistForm() {
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

  const handleJoinWaitlist = async () => {
    if (!user || !device || !db) return;
    setIsSubmitting(true);

    const waitlistData = {
      userId: user.uid,
      userName: `${profile?.familyName} ${profile?.givenName}`,
      userEmail: user.email,
      deviceId: device.id,
      deviceType: device.type,
      status: 'waiting',
      createdAt: serverTimestamp(),
    };

    addDoc(collection(db, 'waitlist'), waitlistData)
      .then(() => {
        toast({ title: "キャンセル待ちに登録しました", description: "在庫が確保され次第、ご案内をお送りします。" });
        router.push('/mypage/devices');
      })
      .finally(() => setIsSubmitting(false));
  };

  if (deviceLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-20 max-w-2xl text-center">
      <Card className="border-none shadow-2xl rounded-[3rem] overflow-hidden bg-white">
        <CardHeader className="bg-primary/5 p-12">
          <Clock className="mx-auto h-16 w-16 text-primary mb-6" />
          <CardTitle className="text-3xl font-headline">キャンセル待ち登録</CardTitle>
          <CardDescription className="text-lg">
            現在、{device?.type}は在庫切れです
          </CardDescription>
        </CardHeader>
        <CardContent className="p-12 space-y-8">
          <p className="text-muted-foreground leading-relaxed">
            キャンセル待ちにご登録いただくと、次回の在庫入荷時や解約が発生した際に、
            優先的にご案内メールを送信させていただきます。
          </p>

          <div className="bg-secondary/30 p-6 rounded-[2rem] flex items-center gap-4 text-left">
            <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">対象機器</p>
              <p className="font-bold text-lg">{device?.type}</p>
            </div>
          </div>

          <div className="space-y-4">
            <Button 
              size="lg" 
              className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl shadow-primary/20" 
              onClick={handleJoinWaitlist}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : '案内を受け取る'}
            </Button>
            <Link href="/devices" className="block">
              <Button variant="ghost" className="w-full h-12 rounded-xl">
                機器一覧に戻る
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ApplyWaitlistPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>}>
      <WaitlistForm />
    </Suspense>
  );
}
