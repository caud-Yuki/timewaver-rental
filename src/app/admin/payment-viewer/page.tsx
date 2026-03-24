'use client';

import { useState, useMemo, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, ArrowUpDown, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Define the structure of the data we expect from our function
interface Subscription {
  id: string;
  customerName: string;
  customerId: string;
  email: string;
  payAmount: number;
  paymentId: string | null;
  recurringId: string | null;
  payType: 'full' | 'monthly';
  status: string;
  createdAt: string; // ISO string format
  deviceName: string;
}

export default function PaymentsDashboard() {
  const { toast } = useToast();
  const [allData, setAllData] = useState<Subscription[]>([]);
  const [filteredData, setFilteredData] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(false);

  // State for filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc');

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const functions = getFunctions(firebaseApp);
      const getSubscriptionsList = httpsCallable(functions, 'getSubscriptionsList');
      const response: any = await getSubscriptionsList();
      
      // Ensure data is in the expected array format
      const subscriptions = Array.isArray(response.data) ? response.data : [];
      setAllData(subscriptions);
      setFilteredData(subscriptions); // Initially, filtered data is all data

      toast({ title: `Successfully fetched ${subscriptions.length} records.` });

    } catch (error: any) {
      console.error("Error fetching subscriptions:", error);
      toast({ variant: 'destructive', title: 'Error', description: `Failed to fetch data: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Effect to run on component mount to fetch initial data
  useEffect(() => {
    fetchSubscriptions();
  }, []);

  // Effect to apply filters, search, and sorting whenever dependencies change
  useEffect(() => {
    let data = [...allData];

    // 1. Filter by status
    if (statusFilter !== 'all') {
      data = data.filter(item => item.status === statusFilter);
    }

    // 2. Filter by payment type
    if (typeFilter !== 'all') {
      data = data.filter(item => item.payType === typeFilter);
    }

    // 3. Search by term
    if (searchTerm) {
      const lowercasedTerm = searchTerm.toLowerCase();
      data = data.filter(item => 
        item.customerName.toLowerCase().includes(lowercasedTerm) ||
        item.customerId.toLowerCase().includes(lowercasedTerm) ||
        (item.paymentId && item.paymentId.toLowerCase().includes(lowercasedTerm)) ||
        (item.recurringId && item.recurringId.toLowerCase().includes(lowercasedTerm)) ||
        item.deviceName.toLowerCase().includes(lowercasedTerm)
      );
    }
    
    // 4. Sort by creation date
    data.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    setFilteredData(data);
  }, [searchTerm, statusFilter, typeFilter, sortOrder, allData]);

  const handleSort = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Payments Dashboard</CardTitle>
          <CardDescription>View, search, and filter all payment records.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Toolbar for Filters and Actions */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <Input 
              placeholder="Search by name, ID, device..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="md:max-w-xs"
            />
            <div className="flex gap-4">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue placeholder="Payment Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="full">One-Time (full)</SelectItem>
                  <SelectItem value="monthly">Subscription (monthly)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="used">Used</SelectItem>
                  {/* Add other statuses from your data as needed */}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleSort} className="flex items-center gap-2">
              Date <ArrowUpDown className="h-4 w-4" />
              <span>{sortOrder === 'asc' ? 'Asc' : 'Desc'}</span>
            </Button>
          </div>

          {/* Data Table */}
          <div className="border rounded-lg overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.length > 0 ? (
                    filteredData.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.customerName}
                          <div className="text-xs text-muted-foreground">{item.customerId}</div>
                        </TableCell>
                        <TableCell>
                          {item.deviceName}
                          <div className="text-xs text-muted-foreground">{item.payType === 'full' ? item.paymentId : item.recurringId}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">¥{item.payAmount.toLocaleString()}</TableCell>
                        <TableCell><span className={`px-2 py-1 text-xs rounded-full ${item.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{item.status}</span></TableCell>
                        <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <a href={`mailto:${item.email}`} title={`Email ${item.customerName}`}>
                            <Button variant="ghost" size="icon">
                              <Mail className="h-4 w-4" />
                            </Button>
                          </a>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-24">No records found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
