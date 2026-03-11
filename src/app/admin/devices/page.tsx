'use client';

import { useState } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, addDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, ShieldAlert } from 'lucide-react';
import { Device, DeviceTypeCode, UserProfile } from '@/types';
import Link from 'next/link';

export default function DeviceManagementPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [isAdding, setIsAdding] = useState(false);
  const [newDevice, setNewDevice] = useState({
    serialNumber: '',
    type: 'TimeWaver Mobile' as any,
    typeCode: 'tw-m' as DeviceTypeCode,
    status: 'available' as any,
    description: '',
    price3mMonthly: 50000,
    price12mMonthly: 30000,
  });

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef as any);

  const devicesQuery = useMemoFirebase(() => {
    if (!db || profile?.role !== 'admin') return null;
    return collection(db, 'devices');
  }, [db, profile?.role]);
  const { data: devices, loading: devicesLoading } = useCollection<Device>(devicesQuery as any);

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;
    setIsAdding(true);

    const deviceData = {
      serialNumber: newDevice.serialNumber,
      type: newDevice.type,
      typeCode: newDevice.typeCode,
      status: newDevice.status,
      description: newDevice.description,
      price: {
        "3m": { full: newDevice.price3mMonthly * 3, monthly: newDevice.price3mMonthly },
        "6m": { full: newDevice.price3mMonthly * 6 * 0.9, monthly: Math.floor(newDevice.price3mMonthly * 0.9) },
        "12m": { full: newDevice.price12mMonthly * 12, monthly: newDevice.price12mMonthly }
      },
      createdAt: serverTimestamp(),
    };

    addDoc(collection(db, 'devices'), deviceData)
      .then(() => {
        toast({ title: "機器を追加しました" });
        setIsAdding(false);
      })
      .catch((err) => {
        toast({ variant: "destructive", title: "追加に失敗しました" });
        setIsAdding(false);
      });
  };

  const handleDeleteDevice = async (id: string) => {
    if (!db || !confirm('本当に削除しますか？')) return;
    deleteDoc(doc(db, 'devices', id))
      .then(() => toast({ title: "削除しました" }))
      .catch(() => toast({ variant: "destructive", title: "削除に失敗しました" }));
  };

  if (authLoading || (profileLoading && !profile)) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  if (!user || profile?.role !== 'admin') return <div className="text-center py-20"><ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" /> 管理者権限が必要です</div>;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-headline">機器在庫の管理</h1>
        <Link href="/admin">
          <Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button>
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-1 border-none shadow-xl rounded-3xl overflow-hidden bg-white">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> 新規機器登録</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleAddDevice} className="space-y-4">
              <div className="space-y-2">
                <Label>シリアル番号</Label>
                <Input required value={newDevice.serialNumber} onChange={e => setNewDevice({...newDevice, serialNumber: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>モデル</Label>
                <Select value={newDevice.typeCode} onValueChange={(v: any) => {
                  const names: Record<DeviceTypeCode, string> = {
                    'tw-m': 'TimeWaver Mobile',
                    'tw-mq': 'TimeWaver Mobile Quantum',
                    'tw-tt': 'TimeWaver Tabletop',
                    'tw-frq': 'TimeWaver Frequency'
                  };
                  setNewDevice({...newDevice, typeCode: v, type: names[v as DeviceTypeCode]});
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
                <Label>月額料金 (3ヶ月プラン)</Label>
                <Input type="number" value={newDevice.price3mMonthly} onChange={e => setNewDevice({...newDevice, price3mMonthly: parseInt(e.target.value)})} />
              </div>
              <div className="space-y-2">
                <Label>月額料金 (12ヶ月プラン)</Label>
                <Input type="number" value={newDevice.price12mMonthly} onChange={e => setNewDevice({...newDevice, price12mMonthly: parseInt(e.target.value)})} />
              </div>
              <div className="space-y-2">
                <Label>説明</Label>
                <Textarea value={newDevice.description} onChange={e => setNewDevice({...newDevice, description: e.target.value})} />
              </div>
              <Button type="submit" className="w-full rounded-xl" disabled={isAdding}>
                {isAdding ? <Loader2 className="animate-spin" /> : '登録する'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-none shadow-xl rounded-3xl overflow-hidden bg-white">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>モデル</TableHead>
                  <TableHead>シリアル</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.type}</TableCell>
                    <TableCell className="font-mono text-xs">{d.serialNumber}</TableCell>
                    <TableCell><Badge variant="outline">{d.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteDevice(d.id)}>
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
    </div>
  );
}
