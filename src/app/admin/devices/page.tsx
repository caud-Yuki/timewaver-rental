
'use client';

import { useState } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, addDoc, doc, serverTimestamp, deleteDoc, updateDoc, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Trash2, Edit, ShieldAlert, LayoutGrid, List, Package } from 'lucide-react';
import { Device, DeviceTypeCode, UserProfile } from '@/types';
import Link from 'next/link';

export default function DeviceManagementPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Partial<Device> | null>(null);

  const [formData, setFormData] = useState({
    serialNumber: '',
    type: 'TimeWaver Mobile',
    typeCode: 'tw-m' as DeviceTypeCode,
    status: 'available' as Device['status'],
    description: '',
    price3mMonthly: 50000,
    price6mMonthly: 40000,
    price12mMonthly: 30000,
  });

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef as any);

  const devicesQuery = useMemoFirebase(() => {
    if (!db || !profile || profile.role !== 'admin') return null;
    return collection(db, 'devices');
  }, [db, profile?.role]);
  const { data: devices, loading: devicesLoading } = useCollection<Device>(devicesQuery as any);

  const handleOpenAddModal = () => {
    setEditingDevice(null);
    setFormData({
      serialNumber: '',
      type: 'TimeWaver Mobile',
      typeCode: 'tw-m',
      status: 'available',
      description: '',
      price3mMonthly: 50000,
      price6mMonthly: 40000,
      price12mMonthly: 30000,
    });
    setIsDialogOpen(true);
  };

  const handleOpenEditModal = (device: Device) => {
    setEditingDevice(device);
    setFormData({
      serialNumber: device.serialNumber,
      type: device.type,
      typeCode: device.typeCode,
      status: device.status,
      description: device.description || '',
      price3mMonthly: device.price?.['3m']?.monthly || 50000,
      price6mMonthly: device.price?.['6m']?.monthly || 40000,
      price12mMonthly: device.price?.['12m']?.monthly || 30000,
    });
    setIsDialogOpen(true);
  };

  const handleSaveDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;
    setIsSubmitting(true);

    const deviceData = {
      serialNumber: formData.serialNumber,
      type: formData.type,
      typeCode: formData.typeCode,
      status: formData.status,
      description: formData.description,
      price: {
        "3m": { full: formData.price3mMonthly * 3, monthly: formData.price3mMonthly },
        "6m": { full: formData.price6mMonthly * 6, monthly: formData.price6mMonthly },
        "12m": { full: formData.price12mMonthly * 12, monthly: formData.price12mMonthly }
      },
      updatedAt: serverTimestamp(),
    };

    if (editingDevice?.id) {
      updateDoc(doc(db, 'devices', editingDevice.id), deviceData as any)
        .then(async () => {
          // Trigger logic: If status changed to 'available', notify the waitlist
          if (formData.status === 'available' && editingDevice.status !== 'available') {
            // Simplified query to avoid index requirement: filter by device and status, sort in memory
            const waitlistQuery = query(
              collection(db, 'waitlist'),
              where('deviceId', '==', editingDevice.id),
              where('status', '==', 'waiting')
            );
            
            const waitlistSnap = await getDocs(waitlistQuery);
            
            if (!waitlistSnap.empty) {
              // Sort by createdAt in memory to find the first person in line
              const items = waitlistSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
              items.sort((a, b) => {
                const timeA = a.createdAt?.seconds || 0;
                const timeB = b.createdAt?.seconds || 0;
                return timeA - timeB;
              });
              
              const firstPerson = items[0];
              updateDoc(doc(db, 'waitlist', firstPerson.id), {
                status: 'notified',
                updatedAt: serverTimestamp()
              });
              toast({ title: "在庫を更新し、キャンセル待ちのユーザーへ通知しました" });
            } else {
              toast({ title: "機器情報を更新しました" });
            }
          } else {
            toast({ title: "機器情報を更新しました" });
          }
          setIsDialogOpen(false);
        })
        .finally(() => setIsSubmitting(false));
    } else {
      addDoc(collection(db, 'devices'), {
        ...deviceData,
        createdAt: serverTimestamp(),
      })
        .then(() => {
          toast({ title: "機器を新規登録しました" });
          setIsDialogOpen(false);
        })
        .finally(() => setIsSubmitting(false));
    }
  };

  const handleDeleteDevice = async (id: string) => {
    if (!db || !confirm('本当に削除しますか？')) return;
    deleteDoc(doc(db, 'devices', id))
      .then(() => toast({ title: "削除しました" }))
      .catch(() => toast({ variant: "destructive", title: "削除に失敗しました" }));
  };

  if (authLoading || (profileLoading && !profile)) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  if (!user || profile?.role !== 'admin') return <div className="container mx-auto px-4 py-20 text-center space-y-4"><ShieldAlert className="mx-auto h-12 w-12 text-destructive" /><h1 className="text-2xl font-bold">管理者権限が必要です</h1><Link href="/admin"><Button variant="outline">戻る</Button></Link></div>;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" /> 機器在庫の管理
          </h1>
          <p className="text-muted-foreground">レンタル機器の登録、編集、ステータス管理</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin">
            <Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button>
          </Link>
          <Button onClick={handleOpenAddModal} className="rounded-xl shadow-lg">
            <Plus className="h-4 w-4 mr-2" /> 新規機器登録
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between bg-white p-2 rounded-2xl shadow-sm border">
        <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)} className="w-fit">
          <TabsList className="bg-secondary/50 rounded-xl h-10">
            <TabsTrigger value="list" className="rounded-lg px-4 flex items-center gap-2">
              <List className="h-4 w-4" /> リスト
            </TabsTrigger>
            <TabsTrigger value="card" className="rounded-lg px-4 flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" /> カード
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="text-xs text-muted-foreground mr-4">
          全 {devices?.length || 0} 台の機器が登録されています
        </div>
      </div>

      {viewMode === 'list' ? (
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/10">
                  <TableHead className="pl-8">モデル</TableHead>
                  <TableHead>シリアル番号</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>月額料金 (12m)</TableHead>
                  <TableHead className="text-right pr-8">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices?.map(d => (
                  <TableRow key={d.id} className="hover:bg-muted/5 transition-colors">
                    <TableCell className="pl-8 font-medium">{d.type}</TableCell>
                    <TableCell className="font-mono text-xs">{d.serialNumber}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === 'available' ? 'default' : 'secondary'} className={d.status === 'available' ? 'bg-emerald-500' : ''}>
                        {d.status === 'available' ? '利用可能' : d.status}
                      </Badge>
                    </TableCell>
                    <TableCell>¥{d.price?.['12m']?.monthly.toLocaleString()}</TableCell>
                    <TableCell className="text-right pr-8 space-x-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-primary" onClick={() => handleOpenEditModal(d)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => handleDeleteDevice(d.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!devices || devices.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-muted-foreground">登録されている機器はありません</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices?.map(d => (
            <Card key={d.id} className="border-none shadow-lg rounded-3xl overflow-hidden bg-white group hover:shadow-xl transition-all">
              <CardHeader className="bg-secondary/10 pb-4">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className="uppercase text-[10px]">{d.typeCode}</Badge>
                  <Badge variant={d.status === 'available' ? 'default' : 'secondary'}>{d.status}</Badge>
                </div>
                <CardTitle className="text-xl font-headline group-hover:text-primary transition-colors">{d.type}</CardTitle>
                <CardDescription className="font-mono text-[10px]">{d.serialNumber}</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">月額料金 (12m)</span>
                  <span className="font-bold">¥{d.price?.['12m']?.monthly.toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{d.description || '説明なし'}</p>
              </CardContent>
              <CardFooter className="bg-secondary/5 p-4 flex justify-end gap-2 border-t">
                <Button variant="ghost" size="sm" className="rounded-xl h-9" onClick={() => handleOpenEditModal(d)}>
                  <Edit className="h-4 w-4 mr-2" /> 編集
                </Button>
                <Button variant="ghost" size="sm" className="rounded-xl h-9 text-destructive" onClick={() => handleDeleteDevice(d.id)}>
                  <Trash2 className="h-4 w-4 mr-2" /> 削除
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Registration/Editing Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-[2rem]">
          <form onSubmit={handleSaveDevice}>
            <DialogHeader>
              <DialogTitle className="text-2xl font-headline">{editingDevice ? '機器情報の編集' : '新規機器登録'}</DialogTitle>
              <DialogDescription>機器の基本情報と料金設定を入力してください</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-6">
              <div className="space-y-2 col-span-2">
                <Label>シリアル番号</Label>
                <Input required value={formData.serialNumber} onChange={e => setFormData({...formData, serialNumber: e.target.value})} className="rounded-xl" placeholder="TW-123456" />
              </div>
              <div className="space-y-2">
                <Label>モデル</Label>
                <Select value={formData.typeCode} onValueChange={(v: any) => {
                  const names: Record<DeviceTypeCode, string> = {
                    'tw-m': 'TimeWaver Mobile',
                    'tw-mq': 'TimeWaver Mobile Quantum',
                    'tw-tt': 'TimeWaver Tabletop',
                    'tw-frq': 'TimeWaver Frequency'
                  };
                  setFormData({...formData, typeCode: v, type: names[v as DeviceTypeCode]});
                }}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tw-m">Mobile</SelectItem>
                    <SelectItem value="tw-mq">Mobile Quantum</SelectItem>
                    <SelectItem value="tw-tt">Tabletop</SelectItem>
                    <SelectItem value="tw-frq">Frequency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ステータス</Label>
                <Select value={formData.status} onValueChange={(v: any) => setFormData({...formData, status: v})}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">利用可能 (在庫)</SelectItem>
                    <SelectItem value="active">利用中 (貸出中)</SelectItem>
                    <SelectItem value="terminated_early">中途終了</SelectItem>
                    <SelectItem value="terminated">契約満了</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>月額料金 (3ヶ月プラン)</Label>
                <Input type="number" value={formData.price3mMonthly} onChange={e => setFormData({...formData, price3mMonthly: parseInt(e.target.value)})} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>月額料金 (6ヶ月プラン)</Label>
                <Input type="number" value={formData.price6mMonthly} onChange={e => setFormData({...formData, price6mMonthly: parseInt(e.target.value)})} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>月額料金 (12ヶ月プラン)</Label>
                <Input type="number" value={formData.price12mMonthly} onChange={e => setFormData({...formData, price12mMonthly: parseInt(e.target.value)})} className="rounded-xl" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>説明</Label>
                <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="rounded-xl" rows={4} placeholder="機器の特徴や搭載オプションなど" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl">キャンセル</Button>
              <Button type="submit" disabled={isSubmitting} className="rounded-xl px-8 shadow-lg">
                {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : editingDevice ? '更新する' : '登録する'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
