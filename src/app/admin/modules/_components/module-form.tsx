'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DeviceModule } from '@/types';

interface ModuleFormProps {
  module?: Partial<DeviceModule> | null;
  onSave: (module: Partial<DeviceModule>) => void;
  onCancel: () => void;
}

export const ModuleForm = ({ module, onSave, onCancel }: ModuleFormProps) => {
  const [formData, setFormData] = useState<Partial<DeviceModule>>(
    module || { name: '', description: '', point: '', order: 0 }
  );

  const handleChange = (field: keyof DeviceModule, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!formData.name) return;
    onSave(formData);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Module Name</Label>
        <Input id="name" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={formData.description} onChange={(e) => handleChange('description', e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="point">Key Feature / Catchphrase</Label>
        <Input id="point" value={formData.point} onChange={(e) => handleChange('point', e.target.value)} />
      </div>
       <div className="space-y-2">
        <Label htmlFor="order">Display Order</Label>
        <Input id="order" type="number" value={formData.order || ''} onChange={(e) => handleChange('order', Number(e.target.value))} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave}>Save Module</Button>
      </div>
    </div>
  );
};