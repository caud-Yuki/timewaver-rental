'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Loader2, ToyBrick } from 'lucide-react';
import { DeviceModule } from '@/types';
import { ModuleForm } from './_components/module-form';
import { ModuleList } from './_components/module-list';

export default function ModulesPage() {
  const db = useFirestore();
  const modulesQuery = useMemo(() => query(collection(db, 'deviceModules'), orderBy('order')), [db]);
  const { data: modules, loading, error } = useCollection<DeviceModule>(modulesQuery);
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<Partial<DeviceModule> | null>(null);

  const handleSave = async (moduleData: Partial<DeviceModule>) => {
    try {
      if (moduleData.id) {
        const { id, ...dataToUpdate } = moduleData;
        await updateDoc(doc(db, 'deviceModules', id), dataToUpdate);
        toast({ title: "Success", description: "Module updated successfully." });
      } else {
        await addDoc(collection(db, 'deviceModules'), { ...moduleData, createdAt: serverTimestamp() });
        toast({ title: "Success", description: "Module created successfully." });
      }
      setIsFormOpen(false);
      setSelectedModule(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "An error occurred while saving the module." });
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this module?")) {
      try {
        await deleteDoc(doc(db, 'deviceModules', id));
        toast({ title: "Success", description: "Module deleted successfully." });
      } catch (e) {
        toast({ variant: "destructive", title: "Error", description: "An error occurred while deleting the module." });
      }
    }
  };

  const handleEdit = (module: DeviceModule) => {
    setSelectedModule(module);
    setIsFormOpen(true);
  };
  
  const handleAddNew = () => {
    setSelectedModule(null);
    setIsFormOpen(true);
  };

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <ToyBrick className="h-8 w-8 text-primary" />
            Device Modules
          </h1>
          <p className="text-muted-foreground">Manage optional modules for rental devices.</p>
        </div>
        <Button className="rounded-xl" onClick={handleAddNew}>
          <PlusCircle className="h-4 w-4 mr-2" />
          Add New Module
        </Button>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-20">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            </div>
          ) : error ? (
            <p className="text-center py-20 text-destructive">Error loading modules.</p>
          ) : (
            <ModuleList modules={modules || []} onEdit={handleEdit} onDelete={handleDelete} />
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedModule?.id ? 'Edit Module' : 'Add New Module'}</DialogTitle>
            <DialogDescription>
              Fill in the details for the device module.
            </DialogDescription>
          </DialogHeader>
          <ModuleForm 
            module={selectedModule}
            onSave={handleSave} 
            onCancel={() => setIsFormOpen(false)} 
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
