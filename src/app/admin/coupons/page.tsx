
'use client';

import { useState } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Edit, Ticket, ShieldAlert } from 'lucide-react';
import { Coupon, UserProfile } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';

export default function CouponManagementPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [currentCoupon, setCurrentCoupon] = useState<Partial<Coupon>>({
    name: '',
    code: '',
    discountType: 'percentage',
    discountValue: 0,
    status: 'inactive',
    maxUsesPerUser: 1,
    maxTotalUsers: 100,
    currentUsageCount: 0
  });

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const couponsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'coupons'), orderBy('createdAt', 'desc'));
  }, [db]);
  const { data: coupons, loading: couponsLoading } = useCollection<Coupon>(couponsQuery as any);

  const handleSaveCoupon = async () => {
    if (!db) return;
    const couponData = {
      ...currentCoupon,
      updatedAt: serverTimestamp(),
    };

    if (currentCoupon.id) {
      updateDoc(doc(db, 'coupons', currentCoupon.id), couponData as any)
        .then(() => {
          toast({ title: "クーポンを更新しました" });
          setIsEditing(false);
        });
    } else {
      addDoc(collection(db, 'coupons'), {
        ...couponData,
        createdAt: serverTimestamp(),
      })
        .then(() => {
          toast({ title: "クーポンを作成しました" });
          setIsEditing(false);
        });
    }
  };

  const handleDelete = async (id: string) => {
    if (!db || !confirm('削除しますか？')) return;
    deleteDoc(doc(db, 'coupons', id))
      .then(() => toast({ title: "削除しました" }));
  };

  if (authLoading || (profile && profile.role !== 'admin' && !authLoading)) {
    if (profile?.role !== 'admin') return <div className="text-center py-20"><ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" /> 管理者権限が必要です</div>;
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-headline flex items-center gap-2"><Ticket className="h-8 w-8 text-primary" /> クーポン管理</h1>
        <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogTrigger asChild>
            <Button className="rounded-xl" onClick={() => setCurrentCoupon({ name: '', code: '', discountType: 'percentage', discountValue: 0, status: 'inactive', maxUsesPerUser: 1, maxTotalUsers: 100, currentUsageCount: 0 })}>
              <Plus className="h-4 w-4 mr-2" /> 新規クーポン作成
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{currentCoupon.id ? 'クーポン編集' : '新規クーポン作成'}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2 col-span-2">
                <Label>クーポン名</Label>
                <Input value={currentCoupon.name} onChange={e => setCurrentCoupon({...currentCoupon, name: e.target.value})} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>クーポンコード</Label>
                <Input value={currentCoupon.code} onChange={e => setCurrentCoupon({...currentCoupon, code: e.target.value.toUpperCase()})} placeholder="WINTER2024" />
              </div>
              <div className="space-y-2">
                <Label>割引タイプ</Label>
                <Select value={currentCoupon.discountType} onValueChange={(v: any) => setCurrentCoupon({...currentCoupon, discountType: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">パーセンテージ (%)</SelectItem>
                    <SelectItem value="fixed">固定金額 (円)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>割引額</Label>
                <Input type="number" value={currentCoupon.discountValue} onChange={e => setCurrentCoupon({...currentCoupon, discountValue: parseInt(e.target.value)})} />
              </div>
              <div className="space-y-2">
                <Label>ステータス</Label>
                <Select value={currentCoupon.status} onValueChange={(v: any) => setCurrentCoupon({...currentCoupon, status: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inactive">非公開</SelectItem>
                    <SelectItem value="active">公開</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>利用上限 (総数)</Label>
                <Input type="number" value={currentCoupon.maxTotalUsers} onChange={e => setCurrentCoupon({...currentCoupon, maxTotalUsers: parseInt(e.target.value)})} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditing(false)}>キャンセル</Button>
              <Button onClick={handleSaveCoupon}>保存する</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>クーポン名</TableHead>
                <TableHead>コード</TableHead>
                <TableHead>割引</TableHead>
                <TableHead>利用状況</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><code className="bg-secondary px-2 py-1 rounded text-xs">{c.code}</code></TableCell>
                  <TableCell>
                    {c.discountType === 'percentage' ? `${c.discountValue}% OFF` : `¥${c.discountValue.toLocaleString()} OFF`}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.currentUsageCount} / {c.maxTotalUsers}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>
                      {c.status === 'active' ? '公開中' : '非公開'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => { setCurrentCoupon(c); setIsEditing(true); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
