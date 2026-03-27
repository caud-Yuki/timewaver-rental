'use client';

import { useMemo, useState } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, DollarSign, Search } from 'lucide-react';
import { Subscription, subscriptionConverter } from '../../../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export default function AdminPaymentsPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Subscription[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  const subscriptionsQuery = useMemo(() => 
    query(collection(db, 'subscriptions'), orderBy('createdAt', 'desc'))
    .withConverter(subscriptionConverter)
  , [db]);
  
  const { data: subscriptions, loading, error } = useCollection<Subscription>(subscriptionsQuery);

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const docRef = doc(db, 'subscriptions', searchTerm.trim()).withConverter(subscriptionConverter);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSearchResults([docSnap.data()]);
      } else {
        setSearchResults([]);
        toast({ variant: 'destructive', title: 'Not Found', description: 'No subscription found with that ID.' });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to search for subscription.' });
      console.error(e);
    }
    setIsSearching(false);
  };

  const getStatusBadge = (status: Subscription['status']) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-500">Active</Badge>;
      case 'completed': return <Badge variant="secondary">Completed</Badge>;
      case 'canceled': return <Badge variant="destructive">Canceled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const displayedData = searchResults ?? subscriptions;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-primary" />
            Payments & Subscriptions
          </h1>
          <p className="text-muted-foreground">View all user subscriptions and their payment status.</p>
        </div>
        <div className="flex w-full max-w-sm items-center space-x-2">
          <Input
            type="text"
            placeholder="Search by Subscription ID"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Button type="button" onClick={handleSearch} disabled={isSearching}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="pl-8 py-5">User ID</TableHead>
                <TableHead>Customer ID</TableHead>
                <TableHead>Device ID</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(loading || isSearching) && <TableRow><TableCell colSpan={8} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>}
              {error && <TableRow><TableCell colSpan={8} className="text-center py-12 text-destructive">Error loading data.</TableCell></TableRow>}
              {!loading && !isSearching && displayedData?.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="pl-8 font-mono text-xs">{sub.userId}</TableCell>
                  <TableCell className="font-mono text-xs">{sub.customerId || 'N/A'}</TableCell>
                  <TableCell className="font-mono text-xs">{sub.deviceId}</TableCell>
                  <TableCell>¥{sub.payAmount ? sub.payAmount.toLocaleString() : 'N/A'}</TableCell>
                  <TableCell>{sub.payType}</TableCell>
                  <TableCell>{getStatusBadge(sub.status)}</TableCell>
                  <TableCell>{sub.startAt?.toDate().toLocaleDateString()}</TableCell>
                  <TableCell>{sub.endAt?.toDate().toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {!loading && !isSearching && displayedData?.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-24 text-muted-foreground">No subscriptions found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
