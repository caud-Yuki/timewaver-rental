'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  query, 
  orderBy 
} from 'firebase/firestore';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Device, DeviceModule, DeviceTypeCode } from '@/types';
import { X, Plus } from 'lucide-react';

interface DeviceFormProps {
  device?: Device | null;
  deviceTypeCodes: DeviceTypeCode[];
  deviceModules: DeviceModule[];
  onSave: (device: Partial<Device>) => void;
  onCancel: () => void;
}

export const DeviceForm = ({ 
  device, 
  deviceTypeCodes, 
  deviceModules,
  onSave,
  onCancel
}: DeviceFormProps) => {
  const [formData, setFormData] = useState<Partial<Device>>(
    device || {
      name: '',
      serialNumber: '',
      typeCode: '',
      status: 'available',
      description: '',
      price: { '3m': 0, '6m': 0, '12m': 0 },
      fullPaymentDiscountRate: 0,
      modules: [],
    }
  );
  const { toast } = useToast();

  const handleChange = (field: keyof Device, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePriceChange = (term: '3m' | '6m' | '12m', value: string) => {
    setFormData(prev => ({
      ...prev,
      price: { ...prev.price, [term]: Number(value) }
    }));
  };
  
  const handleModuleToggle = (moduleId: string) => {
    const currentModules = formData.modules?.map(m => m.id) || [];
    const isSelected = currentModules.includes(moduleId);
    let newModuleIds: string[];

    if (isSelected) {
      newModuleIds = currentModules.filter(id => id !== moduleId);
    } else {
      newModuleIds = [...currentModules, moduleId];
    }
    
    const newModules = deviceModules.filter(m => newModuleIds.includes(m.id));
    handleChange('modules', newModules);
  };

  const handleSave = () => {
    if (!formData.name || !formData.serialNumber || !formData.typeCode) {
      toast({ variant: 'destructive', title: '入力エラー', description: '機器名、シリアル、タイプコードは必須です。' });
      return;
    }
    onSave(formData);
  };
  
  const sortedModules = useMemo(() => 
    [...deviceModules].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)), 
    [deviceModules]
  );

  return (
    <div className="space-y-6 p-1">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="name">機器名</Label>
          <Input id="name" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="serialNumber">シリアル番号</Label>
          <Input id="serialNumber" value={formData.serialNumber} onChange={(e) => handleChange('serialNumber', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="typeCode">タイプコード</Label>
          <Select value={formData.typeCode} onValueChange={(v) => handleChange('typeCode', v)}>
            <SelectTrigger>
              <SelectValue placeholder="タイプを選択..." />
            </SelectTrigger>
            <SelectContent>
              {deviceTypeCodes.map(tc => (
                <SelectItem key={tc.id} value={tc.id}>{tc.type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">ステータス</Label>
          <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">利用可能</SelectItem>
              <SelectItem value="active">使用中</SelectItem>
              <SelectItem value="processing">契約処理中</SelectItem>
              <SelectItem value="maintenance">メンテナンス中</SelectItem>
              <SelectItem value="terminated_early">早期解約</SelectItem>
              <SelectItem value="terminated">期間満了</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="description">詳細</Label>
        <Textarea id="description" value={formData.description} onChange={(e) => handleChange('description', e.target.value)} />
      </div>

      <div>
        <Label className="text-base font-medium">レンタル料金 (円)</Label>
        <div className="grid grid-cols-3 gap-4 mt-2 p-4 border rounded-xl bg-secondary/30">
          <div className="space-y-1">
            <Label htmlFor="price3m" className="text-xs">3ヶ月プラン</Label>
            <Input id="price3m" type="number" value={formData.price?.[_Symbol.for('3m')] || ''} onChange={(e) => handlePriceChange('3m', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="price6m" className="text-xs">6ヶ月プラン</Label>
            <Input id="price6m" type="number" value={formData.price?.[_Symbol.for('6m')] || ''} onChange={(e) => handlePriceChange('6m', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="price12m" className="text-xs">12ヶ月プラン</Label>
            <Input id="price12m" type="number" value={formData.price?.[_Symbol.for('12m')] || ''} onChange={(e) => handlePriceChange('12m', e.target.value)} />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="fullPaymentDiscountRate">一括払い割引率 (%)</Label>
        <Input id="fullPaymentDiscountRate" type="number" value={formData.fullPaymentDiscountRate || ''} onChange={(e) => handleChange('fullPaymentDiscountRate', Number(e.target.value))} />
      </div>

      <div>
        <Label className="text-base font-medium">付属モジュール</Label>
        <div className="mt-2 p-4 border rounded-xl bg-secondary/30 grid grid-cols-2 md:grid-cols-3 gap-4">
          {sortedModules.map(module => (
            <div key={module.id} className="flex items-center space-x-2 bg-white p-3 rounded-lg shadow-sm">
              <Switch
                id={module.id}
                checked={formData.modules?.some(m => m.id === module.id)}
                onCheckedChange={() => handleModuleToggle(module.id)}
              />
              <Label htmlFor={module.id} className="flex flex-col space-y-1 font-normal">
                <span className="font-semibold">{module.name}</span>
                <span className="text-xs text-muted-foreground">{module.point}</span>
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>キャンセル</Button>
        <Button onClick={handleSave}>保存</Button>
      </div>
    </div>
  );
};