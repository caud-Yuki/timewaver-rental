"use client";

import { useState } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, addDoc, doc, serverTimestamp, deleteDoc, updateDoc, query, where, getDocs, writeBatch, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Trash2, Edit, ShieldAlert, LayoutGrid, List, Package } from 'lucide-react';
import { Device, DeviceTypeCode, UserProfile, GlobalSettings, Waitlist } from '@/types';
import Link from 'next/link';
import { DeviceForm, DeviceFormValues } from './_components/device-form';

const deviceTypeNames: Record<DeviceTypeCode, string> = {
  'tw-m': 'TimeWaver Mobile',
  'tw-mq': 'TimeWaver Mobile Quantum',
  'tw-tt': 'TimeWaver Tabletop',
  'tw-frq': 'TimeWaver Frequency'
};

export default function DeviceManagementPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Partial<Device> | null>(null);

  const profileRef = useMemoFirebase(() => user ? doc(db, 'users', user.uid) : null, [db, user]);
  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef as any);

  const settingsRef = useMemoFirebase(() => doc(db, 'settings', 'global'), [db]);
  const { data: settings } = useDoc<GlobalSettings>(settingsRef as any);

  const devicesQuery = useMemoFirebase(() => profile?.role === 'admin' ? collection(db, 'devices') : null, [db, profile?.role]);
  const { data: devices, loading: devicesLoading } = useCollection<Device>(devicesQuery as any);

  const handleOpenAddModal = () => {
    setEditingDevice(null);
    setIsDialogOpen(true);
  };

  const handleOpenEditModal = (device: Device) => {
    setEditingDevice(device);
    setIsDialogOpen(true);
  };

  const handleSaveDevice = async (formData: DeviceFormValues) => {
    if (!db) return;
    setIsSubmitting(true);

    const discountFactor = 1 - (formData.fullPaymentDiscountRate / 100);

    const deviceData = {
      serialNumber: formData.serialNumber,
      type: deviceTypeNames[formData.typeCode],
      typeCode: formData.typeCode,
      status: formData.status,
      description: formData.description,
      modules: formData.modules || [],
      fullPaymentDiscountRate: formData.fullPaymentDiscountRate,
      price: {
        "3m": { full: Math.round(formData.price3mMonthly * 3 * discountFactor), monthly: formData.price3mMonthly },
        "6m": { full: Math.round(formData.price6mMonthly * 6 * discountFactor), monthly: formData.price6mMonthly },
        "12m": { full: Math.round(formData.price12mMonthly * 12 * discountFactor), monthly: formData.price12mMonthly }
      },
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingDevice?.id) {
        await updateDoc(doc(db, 'devices', editingDevice.id), deviceData as any);
        toast({ title: "Device updated successfully." });

        if (formData.status === 'available' && editingDevice.status !== 'available' && settings) {
          const waitlistQuery = query(
            collection(db, 'waitlist'),
            where('deviceId', '==', editingDevice.id),
            where('status', '==', 'waiting')
          );
          const waitlistSnap = await getDocs(waitlistQuery);

          if (!waitlistSnap.empty) {
            const batch = writeBatch(db);
            const items = waitlistSnap.docs.map(d => ({ ...d.data() as Waitlist, id: d.id }));
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
        await addDoc(collection(db, 'devices'), { ...deviceData, createdAt: serverTimestamp() });
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

  if (authLoading || (profileLoading && !profile)) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  if (!user || profile?.role !== 'admin') return <div className="container mx-auto px-4 py-20 text-center space-y-4"><ShieldAlert className="mx-auto h-12 w-12 text-destructive" /><h1 className="text-2xl font-bold">Admin access required</h1><Link href="/admin"><Button variant="outline">Back to Dashboard</Button></Link></div>;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" /> Device & Stock Management
          </h1>
          <p className="text-muted-foreground">Register, edit, and manage status of rental devices.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin"><Button variant="outline" className="rounded-xl">Back to Dashboard</Button></Link>
          <Button onClick={handleOpenAddModal} className="rounded-xl shadow-lg"><Plus className="h-4 w-4 mr-2" /> Add New Device</Button>
        </div>
      </div>

      <div className="flex items-center justify-between bg-white p-2 rounded-2xl shadow-sm border">
        <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)} className="w-fit">
          <TabsList className="bg-secondary/50 rounded-xl h-10">
            <TabsTrigger value="list" className="rounded-lg px-4 flex items-center gap-2"><List className="h-4 w-4" /> List</TabsTrigger>
            <TabsTrigger value="card" className="rounded-lg px-4 flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Card</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="text-xs text-muted-foreground mr-4">Total {devices?.length || 0} devices registered.</div>
      </div>

      {viewMode === 'list' ? (
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow className="bg-secondary/10"><TableHead className="pl-8">Model</TableHead><TableHead>Serial No.</TableHead><TableHead>Status</TableHead><TableHead>Monthly (12m)</TableHead><TableHead className="text-right pr-8">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {devices?.map(d => (
                  <TableRow key={d.id} className="hover:bg-muted/5 transition-colors">
                    <TableCell className="pl-8 font-medium">{d.type}</TableCell>
                    <TableCell className="font-mono text-xs">{d.serialNumber}</TableCell>
                    <TableCell><Badge variant={d.status === 'available' ? 'default' : 'secondary'} className={d.status === 'available' ? 'bg-emerald-500' : ''}>{d.status}</Badge></TableCell>
                    <TableCell>¥{d.price?.['12m']?.monthly.toLocaleString()}</TableCell>
                    <TableCell className="text-right pr-8 space-x-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-primary" onClick={() => handleOpenEditModal(d)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => handleDeleteDevice(d.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!devices || devices.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground">No devices registered.</TableCell></TableRow>
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
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Monthly (12m)</span><span className="font-bold">¥{d.price?.['12m']?.monthly.toLocaleString()}</span></div>
                <p className="text-xs text-muted-foreground line-clamp-2">{d.description || 'No description.'}</p>
              </CardContent>
              <CardFooter className="bg-secondary/5 p-4 flex justify-end gap-2 border-t">
                <Button variant="ghost" size="sm" className="rounded-xl h-9" onClick={() => handleOpenEditModal(d)}><Edit className="h-4 w-4 mr-2" /> Edit</Button>
                <Button variant="ghost" size="sm" className="rounded-xl h-9 text-destructive" onClick={() => handleDeleteDevice(d.id)}><Trash2 className="h-4 w-4 mr-2" /> Delete</Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline">{editingDevice ? 'Edit Device' : 'Add New Device'}</DialogTitle>
            <DialogDescription>Enter device details and pricing.</DialogDescription>
          </DialogHeader>
          <DeviceForm
            initialData={editingDevice}
            onSubmit={handleSaveDevice}
            onClose={() => setIsDialogOpen(false)}
            isSubmitting={isSubmitting}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
