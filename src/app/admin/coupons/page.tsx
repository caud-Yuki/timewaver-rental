'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Ticket, Loader2 } from 'lucide-react';
import { Coupon, couponConverter } from '../../../types';
import { DatePicker } from '@/components/ui/date-picker';
import { Timestamp } from 'firebase/firestore';

export default function CouponsPage() {
  const db = useFirestore();
  const couponsQuery = useMemo(() => query(collection(db, 'coupons'), orderBy('createdAt', 'desc')).withConverter(couponConverter), [db]);
  const { data: coupons, loading } = useCollection<Coupon>(couponsQuery);
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDiscountType, setFormDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [formDiscountValue, setFormDiscountValue] = useState(0);
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');
  const [formExpiresAt, setFormExpiresAt] = useState<Date | undefined>(undefined);
  const [formMaxTotalUsers, setFormMaxTotalUsers] = useState<number | undefined>(undefined);
  const [formNewCustomerOnly, setFormNewCustomerOnly] = useState(false);

  const openCreate = () => {
    setEditingCoupon(null);
    setFormName('');
    setFormCode('');
    setFormDiscountType('percentage');
    setFormDiscountValue(0);
    setFormStatus('active');
    setFormExpiresAt(undefined);
    setFormMaxTotalUsers(undefined);
    setFormNewCustomerOnly(false);
    setIsFormOpen(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormName(coupon.name || '');
    setFormCode(coupon.code || '');
    setFormDiscountType(coupon.discountType || 'percentage');
    setFormDiscountValue(coupon.discountValue || 0);
    setFormStatus(coupon.status || 'active');
    setFormExpiresAt(coupon.expiresAt?.toDate() || undefined);
    setFormMaxTotalUsers(coupon.maxTotalUsers || undefined);
    setFormNewCustomerOnly(coupon.newCustomerOnly || false);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formCode || !formDiscountValue) return;
    try {
      const data: any = {
        name: formName,
        code: formCode.toUpperCase(),
        discountType: formDiscountType,
        discountValue: formDiscountValue,
        status: formStatus,
        isActive: formStatus === 'active',
        expiresAt: formExpiresAt ? Timestamp.fromDate(formExpiresAt) : null,
        maxTotalUsers: formMaxTotalUsers || null,
        newCustomerOnly: formNewCustomerOnly,
      };

      if (editingCoupon?.id) {
        await updateDoc(doc(db, 'coupons', editingCoupon.id), { ...data, updatedAt: serverTimestamp() });
        toast({ title: "成功", description: "クーポンを更新しました。" });
      } else {
        await addDoc(collection(db, 'coupons'), { ...data, currentUsageCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        toast({ title: "成功", description: "クーポンを作成しました。" });
      }
      setIsFormOpen(false);
      setEditingCoupon(null);
    } catch (e) {
      toast({ variant: "destructive", title: "エラー", description: "保存に失敗しました。" });
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("本当にこのクーポンを削除しますか？")) {
      try {
        await deleteDoc(doc(db, 'coupons', id));
        toast({ title: "削除しました" });
      } catch (e) {
        toast({ variant: "destructive", title: "削除に失敗しました" });
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
        <Button className="rounded-xl" onClick={openCreate}>
          <PlusCircle className="h-4 w-4 mr-2" /> 新規クーポン作成
        </Button>
      </div>

      {/* Single Dialog for create/edit */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setEditingCoupon(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCoupon ? 'クーポンを編集' : 'クーポンを新規作成'}</DialogTitle>
            <DialogDescription>クーポンの詳細情報を入力してください。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">クーポン名</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">クーポンコード</Label>
              <Input value={formCode} onChange={(e) => setFormCode(e.target.value.toUpperCase())} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">割引タイプ</Label>
              <Select value={formDiscountType} onValueChange={(v: any) => setFormDiscountType(v)}>
                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">パーセント</SelectItem>
                  <SelectItem value="fixed">固定額</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">割引値</Label>
              <Input type="number" value={formDiscountValue || ''} onChange={(e) => setFormDiscountValue(parseInt(e.target.value, 10) || 0)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">ステータス</Label>
              <Select value={formStatus} onValueChange={(v: any) => setFormStatus(v)}>
                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">有効</SelectItem>
                  <SelectItem value="inactive">無効</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">有効期限</Label>
              <DatePicker value={formExpiresAt} onChange={(date) => setFormExpiresAt(date)} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">最大利用回数</Label>
              <Input type="number" value={formMaxTotalUsers || ''} onChange={(e) => setFormMaxTotalUsers(parseInt(e.target.value, 10) || undefined)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">新規申込限定</Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch checked={formNewCustomerOnly} onCheckedChange={setFormNewCustomerOnly} />
                <span className="text-xs text-muted-foreground">過去に申込履歴がないユーザーのみ利用可能</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsFormOpen(false); setEditingCoupon(null); }}>キャンセル</Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <TableCell className="pl-8 font-medium">
                    {coupon.name}
                    {coupon.newCustomerOnly && <Badge variant="outline" className="ml-2 text-[9px] border-purple-300 text-purple-600">新規限定</Badge>}
                  </TableCell>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(coupon)}>
                      <Edit className="h-4 w-4" />
                    </Button>
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
