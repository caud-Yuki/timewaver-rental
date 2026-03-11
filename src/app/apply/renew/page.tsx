
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, CheckCircle2, ChevronLeft } from 'lucide-react';
import { Device, UserProfile, Application } from '@/types';

export default function RenewalPage() {
  const router = useRouter();
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [rentalType, setRentalType] = useState<'3' | '6' | '12'>('12');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch active rentals for this user
  const activeRentalsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'devices'), where('currentUserId', '==', user.uid), where('status', '==', 'active'));
  }, [db, user]);

  const { data: activeDevices, loading: devicesLoading } = useCollection<Device>(activeRentalsQuery as any);

  const handleRenewalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db || !selectedDeviceId) return;

    setIsSubmitting(true);
    const device = activeDevices.find(d => d.id === selectedDeviceId);
    if (!device) return;

    const renewalData = {
      userId: user.uid,
      userName: user.displayName || 'User',
      userEmail: user.email || '',
      deviceId: device.id,
      deviceSerialNumber: device.serialNumber,
      deviceType: device.type,
      rentalType: parseInt(rentalType),
      payType: 'monthly', // Default for renewals in this simplified logic
      payAmount: device.price[rentalType as keyof Device['price']].monthly,
      status: 'pending',
      type: 'renewal', // Custom flag for internal use
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    addDoc(collection(db, 'applications'), renewalData)
      .then(() => {
        toast({
          title: "更新申請を受け付けました",
          description: "審査後、決済のご案内をお送りします。",
        });
        router.push('/mypage/devices');
      })
      .catch(() => {
        toast({
          variant: "destructive",
          title: "エラーが発生しました",
        });
        setIsSubmitting(false);
      });
  };

  if (devicesLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <Button variant="ghost" onClick={() => router.back()} className="mb-8 rounded-xl">
        <ChevronLeft className="mr-2 h-4 w-4" /> 戻る
      </Button>

      <Card className="border-none shadow-2xl rounded-3xl overflow-hidden bg-white">
        <CardHeader className="bg-primary/5 p-8">
          <div className="flex items-center gap-3 mb-2">
            <RefreshCw className="h-6 w-6 text-primary" />
            <Badge variant="outline" className="bg-white">契約更新</Badge>
          </div>
          <CardTitle className="text-3xl font-bold font-headline">契約更新・再契約</CardTitle>
          <CardDescription>
            現在ご利用中の機器の契約期間を延長します。
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          {activeDevices.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">現在更新可能な契約はありません。</p>
            </div>
          ) : (
            <form onSubmit={handleRenewalSubmit} className="space-y-8">
              <div className="space-y-4">
                <Label className="text-lg font-bold">更新する機器を選択</Label>
                <RadioGroup value={selectedDeviceId} onValueChange={setSelectedDeviceId} className="grid gap-4">
                  {activeDevices.map((d) => (
                    <Label key={d.id} className="flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer hover:bg-secondary/10 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value={d.id} />
                        <div>
                          <p className="font-bold">{d.type}</p>
                          <p className="text-xs text-muted-foreground">S/N: {d.serialNumber}</p>
                        </div>
                      </div>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-4">
                <Label className="text-lg font-bold">新しい契約期間</Label>
                <RadioGroup value={rentalType} onValueChange={(v) => setRentalType(v as any)} className="grid grid-cols-3 gap-4">
                  {['3', '6', '12'].map((m) => (
                    <Label key={m} className="flex flex-col items-center p-4 rounded-2xl border-2 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <RadioGroupItem value={m} className="sr-only" />
                      <span className="text-xl font-bold">{m}ヶ月</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <Button type="submit" className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg" disabled={isSubmitting || !selectedDeviceId}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : '更新申請を送信する'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
