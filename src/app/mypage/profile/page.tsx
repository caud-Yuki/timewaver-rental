
'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Building2, MapPin, Phone, Mail, FileText } from 'lucide-react';
import { UserProfile } from '@/types';

export default function ProfilePage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef as any);

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

    updateDoc(doc(db, 'users', user.uid), {
      ...formData,
      updatedAt: serverTimestamp(),
    })
      .then(() => {
        toast({ title: "プロフィールを更新しました" });
      })
      .catch(() => {
        toast({ variant: "destructive", title: "更新に失敗しました" });
      })
      .finally(() => setIsSaving(false));
  };

  if (authLoading || profileLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold font-headline">会員情報設定</h1>
          <p className="text-muted-foreground">ご登録情報の確認と変更</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
          <CardHeader className="bg-primary/5 p-8">
            <CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-primary" /> 基本情報</CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>姓</Label>
                <Input value={formData.familyName || ''} onChange={e => setFormData({...formData, familyName: e.target.value})} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>名</Label>
                <Input value={formData.givenName || ''} onChange={e => setFormData({...formData, givenName: e.target.value})} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>姓（ふりがな）</Label>
                <Input value={formData.familyNameKana || ''} onChange={e => setFormData({...formData, familyNameKana: e.target.value})} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>名（ふりがな）</Label>
                <Input value={formData.givenNameKana || ''} onChange={e => setFormData({...formData, givenNameKana: e.target.value})} className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>メールアドレス</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input value={formData.email || ''} disabled className="pl-10 rounded-xl bg-secondary/20" />
              </div>
              <p className="text-[10px] text-muted-foreground">メールアドレスの変更はサポート窓口までお問い合わせください。</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
          <CardHeader className="bg-primary/5 p-8">
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> 配送・請求先情報</CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2 col-span-2">
                <Label>会社名（個人の場合は空欄）</Label>
                <Input value={formData.companyName || ''} onChange={e => setFormData({...formData, companyName: e.target.value})} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>郵便番号</Label>
                <Input value={formData.zipcode || ''} onChange={e => setFormData({...formData, zipcode: e.target.value})} className="rounded-xl" placeholder="123-4567" />
              </div>
              <div className="space-y-2">
                <Label>電話番号</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input value={formData.tel || ''} onChange={e => setFormData({...formData, tel: e.target.value})} className="pl-10 rounded-xl" placeholder="090-0000-0000" />
                </div>
              </div>
              <div className="space-y-2 col-span-2">
                <Label>住所</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input value={formData.address1 || ''} onChange={e => setFormData({...formData, address1: e.target.value})} className="pl-10 rounded-xl mb-2" placeholder="東京都渋谷区..." />
                  <Input value={formData.address2 || ''} onChange={e => setFormData({...formData, address2: e.target.value})} className="pl-10 rounded-xl" placeholder="建物名・部屋番号" />
                </div>
              </div>
              <div className="space-y-2 col-span-2">
                <Label>インボイス登録番号</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input value={formData.invoiceNumber || ''} onChange={e => setFormData({...formData, invoiceNumber: e.target.value})} className="pl-10 rounded-xl" placeholder="T1234567890123" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" className="rounded-2xl px-12 h-14 font-bold shadow-xl" disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin h-5 w-5" /> : '情報を更新する'}
          </Button>
        </div>
      </form>
    </div>
  );
}
