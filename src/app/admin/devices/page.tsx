
"use client";

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, addDoc, doc, serverTimestamp, deleteDoc, updateDoc, query, where, getDocs, writeBatch, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Trash2, Edit, ShieldAlert, LayoutGrid, List, Package } from 'lucide-react';
import { Device, DeviceTypeCode, UserProfile, GlobalSettings, Waitlist, DeviceModule, deviceConverter, deviceTypeCodeConverter, userProfileConverter, globalSettingsConverter, waitlistConverter, deviceModuleConverter } from '@/types';
import Link from 'next/link';
import { DeviceForm } from './_components/device-form';

export default function DeviceManagementPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Partial<Device> | null>(null);

  const profileRef = useMemo(() => user ? doc(db, 'users', user.uid).withConverter(userProfileConverter) : null, [db, user]);
  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef);

  const settingsRef = useMemo(() => doc(db, 'settings', 'global').withConverter(globalSettingsConverter), [db]);
  const { data: settings } = useDoc<GlobalSettings>(settingsRef);

  const devicesQuery = useMemo(() => profile?.role === 'admin' ? collection(db, 'devices').withConverter(deviceConverter) : null, [db, profile?.role]);
  const { data: devices, loading: devicesLoading } = useCollection<Device>(devicesQuery);

  const deviceTypeCodesQuery = useMemo(() => collection(db, 'deviceTypeCodes').withConverter(deviceTypeCodeConverter), [db]);
  const { data: deviceTypeCodes, loading: typeCodesLoading } = useCollection<DeviceTypeCode>(deviceTypeCodesQuery);

  const deviceModulesQuery = useMemo(() => collection(db, 'modules').withConverter(deviceModuleConverter), [db]);
  const { data: deviceModules, loading: modulesLoading } = useCollection<DeviceModule>(deviceModulesQuery);

  const deviceTypeMap = useMemo(() => {
    if (!deviceTypeCodes) return {};
    return deviceTypeCodes.reduce((acc, tc) => {
      acc[tc.id] = tc.type;
      return acc;
    }, {} as Record<string, string>);
  }, [deviceTypeCodes]);

  const handleOpenAddModal = () => {
    setEditingDevice(null);
    setIsDialogOpen(true);
  };

  const handleOpenEditModal = (device: Device) => {
    setEditingDevice(device);
    setIsDialogOpen(true);
  };

  const handleSaveDevice = async (formData: Partial<Device>) => {
    if (!db) return;
    setIsSubmitting(true);

    try {
      if (formData.id) {
        const { id, ...dataToUpdate } = formData;
        await updateDoc(doc(db, 'devices', id), { ...dataToUpdate, updatedAt: serverTimestamp() });
        toast({ title: "Device updated successfully." });

        if (formData.status === 'available' && editingDevice?.status !== 'available' && settings) {
          const waitlistQuery = query(
            collection(db, 'waitlist').withConverter(waitlistConverter),
            where('deviceId', '==', formData.id),
            where('status', '==', 'waiting')
          );
          const waitlistSnap = await getDocs(waitlistQuery);

          if (!waitlistSnap.empty) {
            const batch = writeBatch(db);
            const items = waitlistSnap.docs.map(d => d.data());
            items.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
            
            const intervalHours = settings.waitlistEmailInterval || 24;
            const now = new Date();

            items.forEach((item, index) => {
              const waitRef = doc(db, 'waitlist', item.id);
              if (index === 0) {
                batch.update(waitRef, { status: 'notified', updatedAt: serverTimestamp() });
              } else {
                const scheduledTime = new Date(now.getTime() + (index * intervalHours * 60 * 60 * 1000));
                batch.update(waitRef, { status: 'scheduled', scheduledNotifyAt: Timestamp.fromDate(scheduledTime), updatedAt: serverTimestamp() });
              }
            });
            await batch.commit();
            toast({ title: "Device is back in stock and waitlisted users have been notified." });
          }
        }
      } else {
        await addDoc(collection(db, 'devices'), { ...formData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        toast({ title: "New device added successfully." });
      }
      setIsDialogOpen(false);
    } catch (error) {
      toast({ variant: "destructive", title: "An error occurred.", description: (error as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDevice = async (id: string) => {
    if (!db || !confirm('Are you sure you want to delete this device?')) return;
    try {
      await deleteDoc(doc(db, 'devices', id));
      toast({ title: "Device deleted successfully." });
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to delete device." });
    }
  };
  
  const loading = authLoading || profileLoading || devicesLoading || typeCodesLoading || modulesLoading;

  if (loading && !profile) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  if (!user || profile?.role !== 'admin') return <div className="container mx-auto px-4 py-20 text-center space-y-4"><ShieldAlert className="mx-auto h-12 w-12 text-destructive" /><h1 className="text-2xl font-bold">Admin access required</h1><Link href="/admin"><Button variant="outline">Back to Dashboard</Button></Link></div>;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" /> 機器・在庫管理
          </h1>
          <p className="text-muted-foreground">レンタル機器の登録・編集、ステータスの管理を行います。</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin"><Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button></Link>
          <Button onClick={handleOpenAddModal} className="rounded-xl shadow-lg"><Plus className="h-4 w-4 mr-2" /> 新規機器登録</Button>
        </div>
      </div>

      <div className="flex items-center justify-between bg-white p-2 rounded-2xl shadow-sm border">
        <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)} className="w-fit">
          <TabsList className="bg-secondary/50 rounded-xl h-10">
            <TabsTrigger value="list" className="rounded-lg px-4 flex items-center gap-2"><List className="h-4 w-4" /> 一覧表示</TabsTrigger>
            <TabsTrigger value="card" className="rounded-lg px-4 flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> カード表示</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="text-xs text-muted-foreground mr-4">全 {devices?.length || 0} 台の機器が登録されています。</div>
      </div>

      {viewMode === 'list' ? (
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow className="bg-secondary/10"><TableHead className="pl-8">モデル名</TableHead><TableHead>シリアルNo.</TableHead><TableHead>ステータス</TableHead><TableHead>月額 (12ヶ月)</TableHead><TableHead className="text-right pr-8">操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {devices?.map(d => (
                  <TableRow key={d.id} className="hover:bg-muted/5 transition-colors">
                    <TableCell className="pl-8 font-medium">{d.type}</TableCell>
                    <TableCell className="font-mono text-xs">{d.serialNumber}</TableCell>
                    <TableCell><Badge variant={d.status === 'available' ? 'default' : 'secondary'} className={d.status === 'available' ? 'bg-emerald-500' : ''}>{d.status}</Badge></TableCell>
                    <TableCell>¥{(d.price?.["12m"]?.monthly ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right pr-8 space-x-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-primary" onClick={() => handleOpenEditModal(d)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => handleDeleteDevice(d.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!devices || devices.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground">登録されている機器はありません。</TableCell></TableRow>
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
                  <Badge variant="outline" className="uppercase text-[10px]">{deviceTypeMap[d.typeCode]}</Badge>
                  <Badge variant={d.status === 'available' ? 'default' : 'secondary'}>{d.status}</Badge>
                </div>
                <CardTitle className="text-xl font-headline group-hover:text-primary transition-colors">{d.type}</CardTitle>
                <CardDescription className="font-mono text-[10px]">{d.serialNumber}</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">12ヶ月プラン月額</span><span className="font-bold">¥{(d.price?.["12m"]?.monthly ?? 0).toLocaleString()}</span></div>
                <p className="text-xs text-muted-foreground line-clamp-2">{d.description || '説明はありません。'}</p>
              </CardContent>
              <CardFooter className="bg-secondary/5 p-4 flex justify-end gap-2 border-t">
                <Button variant="ghost" size="sm" className="rounded-xl h-9" onClick={() => handleOpenEditModal(d)}><Edit className="h-4 w-4 mr-2" /> 編集</Button>
                <Button variant="ghost" size="sm" className="rounded-xl h-9 text-destructive" onClick={() => handleDeleteDevice(d.id)}><Trash2 className="h-4 w-4 mr-2" /> 削除</Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-3xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline">{editingDevice ? '機器情報の編集' : '新規機器登録'}</DialogTitle>
            <DialogDescription>機器の基本情報と、期間別の料金プランを設定してください。</DialogDescription>
          </DialogHeader>
          <DeviceForm
            device={editingDevice}
            onSave={handleSaveDevice}
            onCancel={() => setIsDialogOpen(false)}
            deviceTypeCodes={deviceTypeCodes || []}
            deviceModules={deviceModules || []}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
