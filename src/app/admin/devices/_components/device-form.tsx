'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { Percent } from 'lucide-react';

interface DeviceFormProps {
  device?: Partial<Device> | null;
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
      type: '', // Using 'type' as the display name per Firestore
      serialNumber: '',
      typeCode: '', 
      status: 'available',
      description: '',
      price: {
        "3m": { full: 0, monthly: 0 },
        "6m": { full: 0, monthly: 0 },
        "12m": { full: 0, monthly: 0 }
      },
      fullPaymentDiscountRate: 0,
      modules: [],
    }
  );

  useEffect(() => {
    if (device) {
      setFormData(device);
    } else {
      // Reset to empty for "New Device" mode
      setFormData({
        type: '',
        serialNumber: '',
        status: 'available',
        price: {
          "3m": { full: 0, monthly: 0 },
          "6m": { full: 0, monthly: 0 },
          "12m": { full: 0, monthly: 0 }
        },
        modules: [],
      });
    }
  }, [device]);

  const { toast } = useToast();

  const handleChange = (field: keyof Device, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Improved calculation logic to avoid useEffect loops
  const updatePrices = (monthlyValue: number, term: '3m' | '6m' | '12m', discount: number) => {
    const months = term === '3m' ? 3 : term === '6m' ? 6 : 12;
    return Math.floor(monthlyValue * months * (1 - discount / 100));
  };

  const handleMonthlyPriceChange = (term: '3m' | '6m' | '12m', value: string) => {
    const monthly = Number(value) || 0;
    const discount = formData.fullPaymentDiscountRate || 0;
    
    setFormData(prev => ({
      ...prev,
      price: {
        ...prev.price,
        [term]: { 
          monthly, 
          full: updatePrices(monthly, term, discount) 
        }
      } as any
    }));
  };

  // Update all full prices when discount rate changes
  const handleDiscountChange = (rate: number) => {
    const newPrice = { ...formData.price };
    (['3m', '6m', '12m'] as const).forEach(term => {
      const monthly = newPrice[term]?.monthly || 0;
      newPrice[term] = {
        monthly,
        full: updatePrices(monthly, term, rate)
      };
    });

    setFormData(prev => ({
      ...prev,
      fullPaymentDiscountRate: rate,
      price: newPrice as any
    }));
  };
  
  const handleModuleToggle = (moduleId: string) => {
    const currentModules = formData.modules || [];
    const isSelected = currentModules.some(m => m.id === moduleId);
    
    let nextModules;
    if (isSelected) {
      nextModules = currentModules.filter(m => m.id !== moduleId);
    } else {
      const moduleToAdd = deviceModules.find(m => m.id === moduleId);
      nextModules = moduleToAdd ? [...currentModules, moduleToAdd] : currentModules;
    }
    handleChange('modules', nextModules);
  };

  const handleSave = () => {
    // Note: checking 'type' here because that's your Firestore name field
    if (!formData.type || !formData.serialNumber || !formData.typeCode) {
      toast({ 
        variant: 'destructive', 
        title: '入力エラー', 
        description: '機器名(type)、シリアル、タイプコードは必須です。' 
      });
      return;
    }
    onSave(formData);
  };

  return (
    <div className="space-y-6 p-1 max-h-[70vh] overflow-y-auto pr-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="type">機器名 (表示用)</Label>
          <Input 
            id="type" 
            placeholder="例: TimeWaver Mobile"
            value={formData.type || ''} 
            onChange={(e) => handleChange('type', e.target.value)} 
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="serialNumber">シリアル番号</Label>
          <Input id="serialNumber" value={formData.serialNumber || ''} onChange={(e) => handleChange('serialNumber', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="typeCode">タイプコード</Label>
          <Select 
            value={formData.typeCode as string} 
            onValueChange={(v) => handleChange('typeCode', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="タイプを選択..." />
            </SelectTrigger>
            <SelectContent>
              {deviceTypeCodes.map(tc => (
                <SelectItem key={tc.id} value={tc.id}>{tc.id} ({tc.type})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
        <div className="space-y-2">
          <Label htmlFor="status">ステータス</Label>
          <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select status..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">利用可能</SelectItem>
              <SelectItem value="active">使用中</SelectItem> {/* Matches your screenshot */}
              <SelectItem value="in_use">使用中 (in_use)</SelectItem> {/* Some legacy codes might use this */}
              <SelectItem value="maintenance">メンテナンス中</SelectItem>
              <SelectItem value="processing">契約処理中</SelectItem>
            </SelectContent>
          </Select>
        </div>
        </div>
      </div>
      
      {/* ... rest of the UI (Price and Modules) remains largely the same ... */}
      {/* Ensure you call handleDiscountChange for the discount input */}
      <Input 
          id="discount" 
          type="number" 
          className="w-16 h-8 text-center font-bold" 
          value={formData.fullPaymentDiscountRate ?? 0} 
          onChange={(e) => handleDiscountChange(Number(e.target.value) || 0)} 
      />

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>キャンセル</Button>
        <Button onClick={handleSave} className="px-8 shadow-lg">保存する</Button>
      </div>
    </div>
  );
};