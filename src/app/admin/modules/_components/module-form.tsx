'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { DeviceModule } from '@/types';

interface ModuleFormProps {
  module?: Partial<DeviceModule> | null;
  onSave: (module: Partial<DeviceModule>) => void;
  onCancel: () => void;
}

export const ModuleForm = ({ module, onSave, onCancel }: ModuleFormProps) => {
  const [formData, setFormData] = useState<Partial<DeviceModule>>(
    { name: '', description: '', point: 0, order: 0 }
  );

  useEffect(() => {
    setFormData(module || { name: '', description: '', point: 0, order: 0 });
  }, [module]);

  const handleChange = (field: keyof DeviceModule, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!formData.name) return;
    onSave(formData);
  };

  return (
    <div className="space-y-6 pt-4">
      <div className="space-y-2">
        <Label htmlFor="name">モジュール名</Label>
        <Input id="name" value={formData.name || ''} onChange={(e) => handleChange('name', e.target.value)} placeholder='例: 高速Wi-Fiモジュール' />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">説明</Label>
        <RichTextEditor 
          value={formData.description || ''} 
          onChange={(value) => handleChange('description', value)} 
          placeholder='例: このモジュールは、デバイスに超高速のインターネット接続を提供します。'
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="point">得点</Label>
        <Input id="point" type="number" value={formData.point || 0} onChange={(e) => handleChange('point', Number(e.target.value))} placeholder='例: 5' />
      </div>
       <div className="space-y-2">
        <Label htmlFor="order">表示順</Label>
        <Input id="order" type="number" value={formData.order || 0} onChange={(e) => handleChange('order', Number(e.target.value))} placeholder='数値が小さいほど先に表示されます' />
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>キャンセル</Button>
        <Button onClick={handleSave}>モジュールを保存</Button>
      </div>
    </div>
  );
};