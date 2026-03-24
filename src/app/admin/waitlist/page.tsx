'use client';

import { useMemo } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, Clock, Mail, Server } from 'lucide-react';
import { Waitlist, Device, waitlistConverter, deviceConverter } from '@/types';

export default function WaitlistPage() {
  const db = useFirestore();

  const waitlistQuery = useMemo(() => 
    query(collection(db, 'waitlist'), orderBy('createdAt', 'desc')).withConverter(waitlistConverter)
  , [db]);
  const { data: waitlist, loading: waitlistLoading, error: waitlistError } = useCollection<Waitlist>(waitlistQuery);

  const devicesQuery = useMemo(() => 
    query(collection(db, 'devices')).withConverter(deviceConverter)
  , [db]);
  const { data: devices, loading: devicesLoading, error: devicesError } = useCollection<Device>(devicesQuery);

  const deviceMap = useMemo(() => {
    if (!devices) return {};
    return devices.reduce((acc, device) => {
      acc[device.id] = device.name;
      return acc;
    }, {} as Record<string, string>);
  }, [devices]);

  const getStatusBadge = (status: Waitlist['status']) => {
    switch (status) {
      case 'waiting': return <Badge className="bg-yellow-500">Waiting</Badge>;
      case 'notified': return <Badge className="bg-blue-500">Notified</Badge>;
      case 'scheduled': return <Badge className="bg-purple-500">Scheduled</Badge>;
      case 'expired': return <Badge variant="secondary">Expired</Badge>;
      case 'converted': return <Badge className="bg-green-500">Converted</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  const loading = waitlistLoading || devicesLoading;
  const error = waitlistError || devicesError;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <Clock className="h-8 w-8 text-primary" />
            Waitlist Management
          </h1>
          <p className="text-muted-foreground">View users who are waiting for devices to become available.</p>
        </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="pl-8 py-5 flex items-center gap-2"><User className="h-4 w-4"/>Email</TableHead>
                <TableHead><Server className="h-4 w-4"/>Device</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Queued At</TableHead>
                <TableHead>Scheduled Notification</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>}
              {error && <TableRow><TableCell colSpan={5} className="text-center py-12 text-destructive">{error.message}</TableCell></TableRow>}
              {!loading && !error && waitlist?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-8 font-mono text-xs flex items-center gap-2"><Mail className="h-3 w-3"/>{item.email}</TableCell>
                  <TableCell>{deviceMap[item.deviceId] || item.deviceId}</TableCell>
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                  <TableCell>{item.createdAt?.toDate().toLocaleString() || '-'}</TableCell>
                  <TableCell>{item.scheduledNotifyAt?.toDate().toLocaleString() || '-'}</TableCell>
                </TableRow>
              ))}
              {!loading && waitlist?.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-24 text-muted-foreground">No users on the waitlist.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
