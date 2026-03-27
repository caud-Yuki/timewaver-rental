'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy, writeBatch } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Loader2, ToyBrick } from 'lucide-react';
import { DeviceModule, deviceModuleConverter } from '@/types';
import { ModuleForm } from './_components/module-form';
import { ModuleList } from './_components/module-list';

export default function ModulesPage() {
  const db = useFirestore();
  const modulesQuery = useMemo(() => query(collection(db, 'modules'), orderBy('order')).withConverter(deviceModuleConverter), [db]);
  const { data: modules, loading, error } = useCollection<DeviceModule>(modulesQuery);
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<Partial<DeviceModule> | null>(null);

  const handleSave = async (moduleData: Partial<DeviceModule>) => {
    try {
      if (moduleData.id) {
        const { id, ...dataToUpdate } = moduleData;
        await updateDoc(doc(db, 'modules', id), dataToUpdate);
        toast({ title: "成功", description: "モジュールが正常に更新されました。" });
      } else {
        await addDoc(collection(db, 'modules'), { ...moduleData, createdAt: serverTimestamp() });
        toast({ title: "成功", description: "モジュールが正常に作成されました。" });
      }
      setIsFormOpen(false);
      setSelectedModule(null);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "エラー", description: "モジュールの保存中にエラーが発生しました。" });
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("このモジュールを本当に削除しますか？")) {
      try {
        await deleteDoc(doc(db, 'modules', id));
        toast({ title: "成功", description: "モジュールを正常に削除しました。" });
      } catch (e) {
        console.error(e);
        toast({ variant: "destructive", title: "エラー", description: "モジュールの削除中にエラーが発生しました。" });
      }
    }
  };
  
  const handleReorder = async (reorderedModules: DeviceModule[]) => {
    try {
      const batch = writeBatch(db);
      reorderedModules.forEach((item, index) => {
        const docRef = doc(db, 'modules', item.id);
        batch.update(docRef, { order: index });
      });
      await batch.commit();
      toast({ title: "成功", description: "モジュールの順序が正常に更新されました。" });
    } catch (e) {
        console.error(e);
        toast({ variant: "destructive", title: "エラー", description: "モジュールの順序の更新中にエラーが発生しました。" });
    }
  }

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
            デバイスモジュール
          </h1>
          <p className="text-muted-foreground">レンタルデバイス用のオプションモジュールを管理します。</p>
        </div>
        <Button className="rounded-xl" onClick={handleAddNew}>
          <PlusCircle className="h-4 w-4 mr-2" />
          新規モジュールを追加
        </Button>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-20">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            </div>
          ) : error ? (
            <p className="text-center py-20 text-destructive">モジュールの読み込み中にエラーが発生しました。</p>
          ) : (
            <ModuleList modules={modules || []} onEdit={handleEdit} onDelete={handleDelete} onReorder={handleReorder} />
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedModule?.id ? 'モジュールを編集' : '新規モジュールを追加'}</DialogTitle>
            <DialogDescription>
              デバイスモジュールの詳細を入力してください。
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
