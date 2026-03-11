
'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Clock, CheckCircle2, ChevronLeft } from 'lucide-react';
import { Device, UserProfile } from '@/types';
import Link from 'next/link';

export default function WaitlistPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const deviceId = searchParams.get('deviceId');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const deviceRef = useMemoFirebase(() => {
    if (!db || !deviceId) return null;
    return doc(db, 'devices', deviceId);
  }, [db, deviceId]);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: device, loading: deviceLoading } = useDoc<Device>(deviceRef as any);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db || !device || !profile) return;

    setIsSubmitting(true);

    const waitlistData = {
      userId: user.uid,
      userName: `${profile.familyName} ${profile.givenName}`,
      userEmail: user.email || '',
      deviceId: device.id,
      deviceType: device.type,
      status: 'waiting',
      createdAt: serverTimestamp(),
    };

    addDoc(collection(db, 'waitlist'), waitlistData)
      .then(() => {
        setIsSuccess(true);
        toast({
          title: "キャンセル待ち登録完了",
          description: "機器に空きが出次第、優先的にご連絡いたします。",
        });
      })
      .catch(() => {
        toast({
          variant: "destructive",
          title: "エラーが発生しました",
          description: "登録に失敗しました。もう一度お試しください。",
        });
        setIsSubmitting(false);
      });
  };

  if (deviceLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  if (isSuccess) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Card className="w-full max-w-md text-center p-12 space-y-6 rounded-3xl shadow-2xl">
          <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
          <h1 className="text-3xl font-bold font-headline">登録完了</h1>
          <p className="text-muted-foreground">
            {device?.type} のキャンセル待ち登録を受け付けました。
          </p>
          <Button className="w-full h-12 rounded-xl" onClick={() => router.push('/devices')}>
            機器一覧に戻る
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <Button variant="ghost" onClick={() => router.back()} className="mb-8 rounded-xl">
        <ChevronLeft className="mr-2 h-4 w-4" /> 戻る
      </Button>

      <Card className="border-none shadow-2xl rounded-3xl overflow-hidden bg-white">
        <CardHeader className="bg-primary/5 p-8">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="h-6 w-6 text-primary" />
            <Badge variant="outline" className="bg-white">キャンセル待ち</Badge>
          </div>
          <CardTitle className="text-3xl font-bold font-headline">キャンセル待ち申込</CardTitle>
          <CardDescription>
            現在、{device?.type} は全て利用中です。空きが出次第、メールにて優先的にご案内いたします。
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          <div className="bg-secondary/20 p-6 rounded-2xl">
            <p className="text-xs text-muted-foreground font-bold uppercase mb-2">対象機器</p>
            <p className="text-xl font-bold">{device?.type}</p>
            <p className="text-sm text-muted-foreground mt-1">S/N: {device?.serialNumber}</p>
          </div>

          <form onSubmit={handleJoinWaitlist} className="space-y-4">
            <div className="space-y-2">
              <Label>お名前</Label>
              <Input readOnly value={profile ? `${profile.familyName} ${profile.givenName}` : ''} className="rounded-xl bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>メールアドレス</Label>
              <Input readOnly value={user?.email || ''} className="rounded-xl bg-muted" />
            </div>
            
            <p className="text-xs text-muted-foreground mt-4">
              ※ご案内は先着順となります。<br />
              ※案内メール送信後、48時間以内にご返信がない場合は次の方へ権利が移ります。
            </p>

            <Button type="submit" className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg" disabled={isSubmitting || !user}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : 'キャンセル待ちに登録する'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
