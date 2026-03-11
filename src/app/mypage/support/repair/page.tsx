
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, addDoc, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Wrench, AlertCircle, Camera } from 'lucide-react';
import { Device, UserProfile } from '@/types';

export default function RepairRequestPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    deviceId: '',
    type: 'repair' as 'repair' | 'support',
    description: '',
  });

  const devicesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'devices'), where('currentUserId', '==', user.uid), where('status', '==', 'active'));
  }, [db, user]);

  const { data: myDevices, loading: devicesLoading } = useCollection<Device>(devicesQuery as any);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !user || !formData.deviceId) return;

    setIsSubmitting(true);
    const requestData = {
      userId: user.uid,
      userName: `${profile?.familyName} ${profile?.givenName}`,
      userEmail: user.email,
      deviceId: formData.deviceId,
      type: formData.type,
      description: formData.description,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    addDoc(collection(db, 'supportRequests'), requestData)
      .then(() => {
        toast({ title: "依頼を送信しました", description: "内容を確認の上、担当者よりご連絡いたします。" });
        router.push('/mypage/devices');
      })
      .finally(() => setIsSubmitting(false));
  };

  if (authLoading || devicesLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold font-headline">修理・サポート依頼</h1>
        <p className="text-muted-foreground">お困りの内容を詳しくお知らせください</p>
      </div>

      <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="bg-primary/5 p-8">
          <CardTitle className="flex items-center gap-2"><Wrench className="h-6 w-6 text-primary" /> 依頼フォーム</CardTitle>
          <CardDescription>対象の機器を選択し、症状を入力してください</CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>対象の機器</Label>
              <Select value={formData.deviceId} onValueChange={(v) => setFormData({...formData, deviceId: v})}>
                <SelectTrigger className="rounded-xl h-12">
                  <SelectValue placeholder="レンタル中の機器を選択" />
                </SelectTrigger>
                <SelectContent>
                  {myDevices.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.type} ({d.serialNumber})</SelectItem>
                  ))}
                  {myDevices.length === 0 && (
                    <SelectItem value="none" disabled>レンタル中の機器がありません</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>依頼の種類</Label>
              <Select value={formData.type} onValueChange={(v: any) => setFormData({...formData, type: v})}>
                <SelectTrigger className="rounded-xl h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="repair">故障・修理の依頼</SelectItem>
                  <SelectItem value="support">操作方法・活用方法の相談</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>具体的な内容</Label>
              <Textarea 
                rows={8} 
                className="rounded-xl" 
                placeholder="症状や質問内容を詳しく入力してください" 
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
                required
              />
            </div>

            <div className="bg-secondary/20 p-6 rounded-2xl flex items-start gap-4">
              <AlertCircle className="h-6 w-6 text-primary shrink-0 mt-1" />
              <div className="text-sm text-muted-foreground space-y-2">
                <p className="font-bold text-primary">ご注意事項</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>故障の場合、状況確認のため写真の送付を後ほどお願いする場合があります。</li>
                  <li>過失による故障の場合、修理費用が発生することがあります。</li>
                  <li>受付順に対応いたしますが、回答まで1〜2営業日いただく場合がございます。</li>
                </ul>
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full h-14 rounded-2xl font-bold shadow-xl" disabled={isSubmitting || myDevices.length === 0}>
              {isSubmitting ? <Loader2 className="animate-spin h-5 w-5" /> : '依頼を送信する'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
