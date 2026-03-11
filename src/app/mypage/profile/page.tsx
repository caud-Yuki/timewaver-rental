
'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Building, MapPin, Phone, CreditCard } from 'lucide-react';
import { UserProfile } from '@/types';

export default function ProfilePage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile, loading } = useDoc<UserProfile>(profileRef as any);

  const [formData, setFormData] = useState<Partial<UserProfile>>({});

  useEffect(() => {
    if (profile) {
      setFormData(profile);
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !user) return;
    setIsSaving(true);

    const updateData = {
      ...formData,
      updatedAt: serverTimestamp(),
    };

    updateDoc(doc(db, 'users', user.uid), updateData)
      .then(() => {
        toast({ title: "プロフィールを更新しました" });
      })
      .catch(() => {
        toast({ variant: "destructive", title: "更新に失敗しました" });
      })
      .finally(() => setIsSaving(false));
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold font-headline mb-8">個人情報設定</h1>

      <form onSubmit={handleSave} className="space-y-8">
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> 基本情報</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>姓</Label>
              <Input value={formData.familyName || ''} onChange={e => setFormData({...formData, familyName: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>名</Label>
              <Input value={formData.givenName || ''} onChange={e => setFormData({...formData, givenName: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>姓（ふりがな）</Label>
              <Input value={formData.familyNameKana || ''} onChange={e => setFormData({...formData, familyNameKana: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>名（ふりがな）</Label>
              <Input value={formData.givenNameKana || ''} onChange={e => setFormData({...formData, givenNameKana: e.target.value})} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2"><Building className="h-5 w-5" /> 会社・インボイス情報</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label>会社名</Label>
              <Input value={formData.companyName || ''} onChange={e => setFormData({...formData, companyName: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>インボイス番号</Label>
              <Input placeholder="T1234567890123" value={formData.invoiceNumber || ''} onChange={e => setFormData({...formData, invoiceNumber: e.target.value})} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> 住所・連絡先</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>郵便番号</Label>
                <Input value={formData.zipcode || ''} onChange={e => setFormData({...formData, zipcode: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>電話番号</Label>
                <Input value={formData.tel || ''} onChange={e => setFormData({...formData, tel: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>住所1（市区町村・番地）</Label>
              <Input value={formData.address1 || ''} onChange={e => setFormData({...formData, address1: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>住所2（建物名・部屋番号）</Label>
              <Input value={formData.address2 || ''} onChange={e => setFormData({...formData, address2: e.target.value})} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" className="rounded-xl px-12" disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin h-5 w-5" /> : '設定を保存する'}
          </Button>
        </div>
      </form>
    </div>
  );
}
