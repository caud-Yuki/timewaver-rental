'use client';

import { useEffect, useState } from 'react';
import { useFirestore, useDoc, useUser } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Loader2, Settings, Save } from 'lucide-react';
import { GlobalSettings, UserProfile } from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function SettingsPage() {
  const db = useFirestore();
  const { user } = useUser();
  const settingsRef = doc(db, 'settings', 'global');
  const { data: initialSettings, loading: settingsLoading, error: settingsError } = useDoc<GlobalSettings>(settingsRef as any);
  const {data: userProfile, loading: userLoading} = useDoc<UserProfile>(user ? doc(db, 'users', user.uid) : null);

  const [settings, setSettings] = useState<Partial<GlobalSettings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
    }
  }, [initialSettings]);

  const handleInputChange = (path: string, value: any) => {
    const keys = path.split('.');
    setSettings(prev => {
      const newSettings = { ...prev };
      let current: any = newSettings;
      keys.forEach((key, index) => {
        if (index === keys.length - 1) {
          current[key] = value;
        } else {
          current[key] = { ...(current[key] || {}) };
          current = current[key];
        }
      });
      return newSettings;
    });
  };
  
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const settingsToUpdate = { ...settings, updatedAt: serverTimestamp() };
      await updateDoc(settingsRef, settingsToUpdate as any);
      toast({ title: "Success", description: "Settings have been updated successfully." });
    } catch (error) {
      console.error("Error saving settings: ", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to save settings." });
    } finally {
      setIsSaving(false);
    }
  };
  
  if (settingsLoading || userLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-primary" /></div>;
  }

  if (userProfile && userProfile.role !== 'admin') {
      return <div>Unauthorized</div>
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          Global Settings
        </h1>
        <p className="text-muted-foreground">Manage application-wide settings and configurations.</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="grid w-full grid-cols-2 md:w-1/2">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="firstpay">FirstPay API</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Card className="border-none shadow-xl rounded-3xl bg-white">
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>General settings for the application logic and user-facing information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                 <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input id="companyName" value={settings.companyName || ''} onChange={(e) => handleInputChange('companyName', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="managerName">Manager Name</Label>
                    <Input id="managerName" value={settings.managerName || ''} onChange={(e) => handleInputChange('managerName', e.target.value)} />
                  </div>
                   <div className="space-y-2">
                    <Label htmlFor="managerEmail">Manager Email</Label>
                    <Input id="managerEmail" type="email" value={settings.managerEmail || ''} onChange={(e) => handleInputChange('managerEmail', e.target.value)} />
                  </div>
              </div>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-6 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="waitlistValidityHours">Waitlist Validity (Hours)</Label>
                    <Input 
                      id="waitlistValidityHours" 
                      type="number" 
                      value={settings.waitlistValidityHours || 0} 
                      onChange={(e) => handleInputChange('waitlistValidityHours', Number(e.target.value) || 0)} 
                    />
                    <p className="text-xs text-muted-foreground">How long a user has to act after being notified from waitlist.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="waitlistEmailInterval">Waitlist Email Interval (Hours)</Label>
                    <Input 
                      id="waitlistEmailInterval" 
                      type="number" 
                      value={settings.waitlistEmailInterval || 0} 
                      onChange={(e) => handleInputChange('waitlistEmailInterval', Number(e.target.value) || 0)} 
                    />
                     <p className="text-xs text-muted-foreground">Time between notifications for scheduled waitlist users.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="applicationSessionMinutes">Application Session (Minutes)</Label>
                    <Input 
                      id="applicationSessionMinutes" 
                      type="number" 
                      value={settings.applicationSessionMinutes || 0} 
                      onChange={(e) => handleInputChange('applicationSessionMinutes', Number(e.target.value) || 0)} 
                    />
                     <p className="text-xs text-muted-foreground">Time limit for a user to complete the application process.</p>
                  </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="firstpay">
          <Card className="border-none shadow-xl rounded-3xl bg-white">
            <CardHeader>
              <CardTitle>FirstPay API Settings</CardTitle>
              <CardDescription>API credentials and mode for the FirstPay payment gateway.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
               <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={settings.mode || 'test'} onValueChange={(v) => handleInputChange('mode', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">Test Mode</SelectItem>
                      <SelectItem value="production">Production Mode</SelectItem>
                    </SelectContent>
                  </Select>
              </div>
              <div className="p-6 rounded-2xl bg-secondary/30">
                <h3 className="font-semibold mb-4">Test Environment</h3>
                <div className="space-y-4">
                   <div className="space-y-2">
                    <Label htmlFor="testApiKey">API Key</Label>
                    <Input id="testApiKey" value={settings.firstpayTest?.apiKey || ''} onChange={(e) => handleInputChange('firstpayTest.apiKey', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="testBearerToken">Bearer Token</Label>
                    <Input id="testBearerToken" value={settings.firstpayTest?.bearerToken || ''} onChange={(e) => handleInputChange('firstpayTest.bearerToken', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-secondary/30">
                <h3 className="font-semibold mb-4">Production Environment</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="prodApiKey">API Key</Label>
                    <Input id="prodApiKey" value={settings.firstpayProd?.apiKey || ''} onChange={(e) => handleInputChange('firstpayProd.apiKey', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prodBearerToken">Bearer Token</Label>
                    <Input id="prodBearerToken" value={settings.firstpayProd?.bearerToken || ''} onChange={(e) => handleInputChange('firstpayProd.bearerToken', e.target.value)} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

       <div className="flex justify-end mt-8">
          <Button onClick={handleSave} disabled={isSaving} className="rounded-xl shadow-lg">
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2"/>}
            Save Changes
          </Button>
        </div>
    </div>
  );
}
