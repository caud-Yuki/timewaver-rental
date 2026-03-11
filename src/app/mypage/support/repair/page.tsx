
'use client';

import { useState } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Wrench, Clock, FileUp, AlertCircle } from 'lucide-react';
import { Application, SupportRequest } from '@/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export default function RepairRequestPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    deviceId: '',
    description: '',
  });

  const activeRentalsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'applications'), where('userId', '==', user.uid), where('status', '==', 'approved'));
  }, [db, user]);
  const { data: rentals, loading: rentalsLoading } = useCollection<Application>(activeRentalsQuery as any);

  const requestsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'supportRequests'), where('userId', '==', user.uid));
  }, [db, user]);
  const { data: requests, loading: requestsLoading } = useCollection<SupportRequest>(requestsQuery as any);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !user) return;
    setIsSubmitting(true);

    const requestData = {
      userId: user.uid,
      userName: user.displayName || user.email || 'User',
      userEmail: user.email || '',
      type: 'repair',
      deviceId: formData.deviceId,
      description: formData.description,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    addDoc(collection(db, 'supportRequests'), requestData)
      .then(() => {
        toast({ title: "修理依頼を送信しました", description: "担当者より追ってご連絡いたします。" });
        setFormData({ deviceId: '', description: '' });
      })
      .catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'supportRequests', operation: 'create', requestResourceData: requestData }));
      })
      .finally(() => setIsSubmitting(false));
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl space-y-12">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold font-headline flex items-center gap-2"><Wrench className="h-8 w-8 text-primary" /> 修理・サポート依頼</h1>
        <p className="text-muted-foreground">機器の不具合や故障、操作に関するサポートが必要な場合はこちらからご依頼ください。</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
          <CardHeader className="bg-primary/5">
            <CardTitle>依頼フォーム</CardTitle>
            <CardDescription>詳細を入力して送信してください</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label>対象機器</Label>
                <Select value={formData.deviceId} onValueChange={(v) => setFormData({...formData, deviceId: v})}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="機器を選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {rentals.map(r => (
                      <SelectItem key={r.id} value={r.deviceId}>TimeWaver {r.deviceType} ({r.deviceSerialNumber})</SelectItem>
                    ))}
                    {rentals.length === 0 && <SelectItem value="none" disabled>レンタル中の機器がありません</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>症状・お問い合わせ内容</Label>
                <Textarea 
                  placeholder="不具合の状況を詳しく記入してください" 
                  rows={6} 
                  className="rounded-xl"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>写真添付 (任意)</Label>
                <div className="border-2 border-dashed border-secondary rounded-2xl p-4 text-center cursor-pointer hover:bg-secondary/10 transition-colors">
                  <FileUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <span className="text-xs text-muted-foreground">画像を選択（複数可）</span>
                </div>
              </div>

              <Button type="submit" className="w-full h-12 rounded-xl text-lg font-bold" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : '依頼を送信する'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <h3 className="font-bold text-xl flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> 依頼履歴</h3>
          {requests.map(req => (
            <Card key={req.id} className="border-none shadow-md rounded-2xl overflow-hidden bg-white">
              <CardContent className="p-4 flex items-start gap-4">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${req.status === 'resolved' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                  {req.status === 'resolved' ? <Wrench className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <span className="text-xs text-muted-foreground">{new Date(req.createdAt.seconds * 1000).toLocaleDateString()}</span>
                    <Badge variant={req.status === 'resolved' ? 'default' : 'outline'}>{req.status}</Badge>
                  </div>
                  <p className="text-sm font-bold mt-1 line-clamp-1">{req.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {requests.length === 0 && <p className="text-center text-muted-foreground py-10">履歴はありません</p>}
        </div>
      </div>
    </div>
  );
}
