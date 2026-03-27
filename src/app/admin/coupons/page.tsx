'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
  DialogTrigger 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Ticket, Loader2 } from 'lucide-react';
import { Coupon, couponConverter } from '../../../types';
import { DatePicker } from '@/components/ui/date-picker';
import { Timestamp } from 'firebase/firestore';

const CouponForm = ({ coupon, onSave, onCancel }: { coupon?: Partial<Coupon>, onSave: (c: Partial<Coupon>) => void, onCancel: () => void }) => {
  const [currentCoupon, setCurrentCoupon] = useState<Partial<Coupon>>(coupon || { code: '', discountType: 'percentage', discountValue: 0, status: 'active' });

  const handleChange = (field: keyof Coupon, value: any) => {
    setCurrentCoupon(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!currentCoupon.code || !currentCoupon.discountValue) return;
    onSave(currentCoupon);
  };
  
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{coupon?.id ? 'クーポンを編集' : 'クーポンを新規作成'}</DialogTitle>
        <DialogDescription>クーポンの詳細情報を入力してください。</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="name" className="text-right">クーポン名</Label>
          <Input id="name" value={currentCoupon.name || ''} onChange={(e) => handleChange('name', e.target.value)} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="code" className="text-right">クーポンコード</Label>
          <Input id="code" value={currentCoupon.code || ''} onChange={(e) => handleChange('code', e.target.value.toUpperCase())} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="discountType" className="text-right">割引タイプ</Label>
          <Select value={currentCoupon.discountType} onValueChange={(v: Coupon['discountType']) => handleChange('discountType', v)}>
            <SelectTrigger className="col-span-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">パーセント</SelectItem>
              <SelectItem value="fixed">固定額</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="discountValue" className="text-right">割引値</Label>
          <Input id="discountValue" type="number" value={currentCoupon.discountValue || ''} onChange={(e) => handleChange('discountValue', parseInt(e.target.value, 10))} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="status" className="text-right">ステータス</Label>
          <Select value={currentCoupon.status} onValueChange={(v: Coupon['status']) => handleChange('status', v)}>
            <SelectTrigger className="col-span-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">有効</SelectItem>
              <SelectItem value="inactive">無効</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="expiresAt" className="text-right">有効期限</Label>
          <DatePicker 
            value={currentCoupon.expiresAt?.toDate()} 
            onChange={(date) => handleChange('expiresAt', date ? Timestamp.fromDate(date) : undefined)}
          />
        </div>
         <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="maxTotalUsers" className="text-right">最大利用回数</Label>
          <Input id="maxTotalUsers" type="number" value={currentCoupon.maxTotalUsers || ''} onChange={(e) => handleChange('maxTotalUsers', parseInt(e.target.value, 10))} className="col-span-3" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>キャンセル</Button>
        <Button onClick={handleSave}>保存</Button>
      </DialogFooter>
    </DialogContent>
  );
};

export default function CouponsPage() {
  const db = useFirestore();
  const couponsQuery = useMemo(() => query(collection(db, 'coupons'), orderBy('createdAt', 'desc')).withConverter(couponConverter), [db]);
  const { data: coupons, loading, error } = useCollection<Coupon>(couponsQuery);
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | undefined>(undefined);

  const handleSave = async (couponData: Partial<Coupon>) => {
    try {
      if (couponData.id) {
        const { id, ...dataToUpdate } = couponData;
        await updateDoc(doc(db, 'coupons', id), { ...dataToUpdate, updatedAt: serverTimestamp() });
        toast({ title: "成功", description: "クーポンが更新されました。" });
      } else {
        await addDoc(collection(db, 'coupons'), { ...couponData, isActive: couponData.status === 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        toast({ title: "成功", description: "クーポンが作成されました。" });
      }
      setIsFormOpen(false);
      setSelectedCoupon(undefined);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "エラー", description: "クーポンの保存中にエラーが発生しました。" });
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("本当にこのクーポンを削除しますか？")) {
      try {
        await deleteDoc(doc(db, 'coupons', id));
        toast({ title: "成功", description: "クーポンが削除されました。" });
      } catch (e) {
        toast({ variant: "destructive", title: "エラー", description: "クーポンの削除中にエラーが発生しました。" });
      }
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <Ticket className="h-8 w-8 text-primary" /> クーポン管理
          </h1>
          <p className="text-muted-foreground">割引クーポンの作成、編集、管理を行います。</p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl" onClick={() => setSelectedCoupon(undefined)}>
              <PlusCircle className="h-4 w-4 mr-2" />
              新規クーポン作成
            </Button>
          </DialogTrigger>
          <CouponForm onSave={handleSave} onCancel={() => setIsFormOpen(false)} coupon={selectedCoupon} />
        </Dialog>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="pl-8 py-5">クーポン名</TableHead>
                <TableHead>コード</TableHead>
                <TableHead>割引</TableHead>
                <TableHead>有効期限</TableHead>
                <TableHead>使用状況</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right pr-8">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>}
              {!loading && coupons?.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell className="pl-8 font-medium">{coupon.name}</TableCell>
                  <TableCell><code className="bg-muted px-2 py-1 rounded-md text-sm">{coupon.code}</code></TableCell>
                  <TableCell>{coupon.discountType === 'percentage' ? `${coupon.discountValue}%` : `¥${coupon.discountValue.toLocaleString()}`}</TableCell>
                  <TableCell>{coupon.expiresAt ? coupon.expiresAt.toDate().toLocaleDateString() : '-'}</TableCell>
                   <TableCell>{coupon.currentUsageCount || 0} / {coupon.maxTotalUsers || '∞'}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs rounded-full ${coupon.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {coupon.status === 'active' ? '有効' : '無効'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right pr-8 space-x-1">
                    <Dialog open={isFormOpen && selectedCoupon?.id === coupon.id} onOpenChange={(isOpen) => !isOpen && setSelectedCoupon(undefined)}>
                      <DialogTrigger asChild>
                         <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setSelectedCoupon(coupon); setIsFormOpen(true); }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <CouponForm coupon={selectedCoupon} onSave={handleSave} onCancel={() => { setIsFormOpen(false); setSelectedCoupon(undefined); }} />
                    </Dialog>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => handleDelete(coupon.id)}>
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
