
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
import { X, Plus, Percent } from 'lucide-react';

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
      name: '',
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
  const { toast } = useToast();

  const handleChange = (field: keyof Device, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleMonthlyPriceChange = (term: '3m' | '6m' | '12m', value: string) => {
    const monthly = Number(value) || 0;
    const months = term === '3m' ? 3 : term === '6m' ? 6 : 12;
    const discount = formData.fullPaymentDiscountRate || 0;
    const full = Math.floor(monthly * months * (1 - discount / 100));

    setFormData(prev => ({
      ...prev,
      price: {
        ...prev.price,
        [term]: { full, monthly }
      } as any
    }));
  };

  // Recalculate full prices if discount rate changes
  useEffect(() => {
    if (formData.price) {
      const discount = formData.fullPaymentDiscountRate || 0;
      const newPrice = { ...formData.price };
      
      (['3m', '6m', '12m'] as const).forEach(term => {
        const months = term === '3m' ? 3 : term === '6m' ? 6 : 12;
        const monthly = newPrice[term]?.monthly || 0;
        newPrice[term] = {
          monthly,
          full: Math.floor(monthly * months * (1 - discount / 100))
        };
      });

      setFormData(prev => ({ ...prev, price: newPrice as any }));
    }
  }, [formData.fullPaymentDiscountRate]);
  
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
    <div className="space-y-6 p-1 max-h-[70vh] overflow-y-auto pr-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="name">機器名</Label>
          <Input id="name" value={formData.name || ''} onChange={(e) => handleChange('name', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="serialNumber">シリアル番号</Label>
          <Input id="serialNumber" value={formData.serialNumber || ''} onChange={(e) => handleChange('serialNumber', e.target.value)} />
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
              <SelectItem value="in_use">使用中</SelectItem>
              <SelectItem value="maintenance">メンテナンス中</SelectItem>
              <SelectItem value="processing">契約処理中</SelectItem>
              <SelectItem value="terminated_early">早期解約</SelectItem>
              <SelectItem value="terminated">期間満了</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="description">詳細</Label>
        <Textarea id="description" value={formData.description || ''} onChange={(e) => handleChange('description', e.target.value)} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-bold">レンタル料金設定 (月額)</Label>
          <div className="flex items-center gap-2 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100">
            <Percent className="h-4 w-4 text-rose-500" />
            <Label htmlFor="discount" className="text-xs font-bold text-rose-700">一括割引率 (%)</Label>
            <Input 
              id="discount" 
              type="number" 
              className="w-16 h-8 text-center font-bold" 
              value={formData.fullPaymentDiscountRate ?? 0} 
              onChange={(e) => handleChange('fullPaymentDiscountRate', Number(e.target.value) || 0)} 
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['3m', '6m', '12m'] as const).map(term => (
            <div key={term} className="p-4 border rounded-xl bg-secondary/20 space-y-3">
              <Label className="font-bold text-primary">{term.replace('m', 'ヶ月プラン')}</Label>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase font-bold">月額単価</Label>
                <Input 
                  type="number" 
                  value={formData.price?.[term]?.monthly ?? 0} 
                  onChange={(e) => handleMonthlyPriceChange(term, e.target.value)} 
                  className="bg-white"
                />
              </div>
              <div className="pt-2 border-t border-white/50">
                <Label className="text-[10px] text-muted-foreground uppercase font-bold">一括支払額 (自動計算)</Label>
                <div className="text-sm font-bold text-rose-600 px-3 py-2 bg-white rounded-md border">
                  ¥{(formData.price?.[term]?.full ?? 0).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-base font-bold">付属モジュール</Label>
        <div className="mt-2 p-4 border rounded-xl bg-secondary/10 grid grid-cols-2 md:grid-cols-3 gap-4">
          {sortedModules.map(module => (
            <div key={module.id} className="flex items-center space-x-2 bg-white p-3 rounded-lg shadow-sm border">
              <Switch
                id={module.id}
                checked={formData.modules?.some(m => m.id === module.id)}
                onCheckedChange={() => handleModuleToggle(module.id)}
              />
              <Label htmlFor={module.id} className="flex flex-col space-y-1 font-normal cursor-pointer">
                <span className="font-semibold text-xs">{module.name}</span>
                <span className="text-[10px] text-muted-foreground line-clamp-1">{module.point}</span>
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>キャンセル</Button>
        <Button onClick={handleSave} className="px-8 shadow-lg">保存する</Button>
      </div>
    </div>
  );
};
