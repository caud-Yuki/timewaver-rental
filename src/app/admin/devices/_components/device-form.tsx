'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Device, DeviceModule, DeviceTypeCode } from '@/types';
import { Percent, Trash2, Plus, Upload, ImageIcon, X } from 'lucide-react';
import Image from 'next/image';
import { useRef } from 'react';

interface DeviceFormProps {
  device?: Partial<Device> | null;
  deviceTypeCodes: DeviceTypeCode[];
  deviceModules: DeviceModule[];
  onSave: (device: Partial<Device>, imageFile?: File | null) => void;
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
      type: '',
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
      setFormData({
        type: '',
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
        packageContents: [],
      });
    }
  }, [device]);

  const { toast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(device?.imageUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'ファイルサイズエラー', description: '画像は5MB以下にしてください。' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'ファイル形式エラー', description: '画像ファイルのみアップロードできます。' });
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleChange = (field: keyof Device, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateFullPrice = (monthlyValue: number, term: '3m' | '6m' | '12m', discount: number) => {
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
          full: updateFullPrice(monthly, term, discount)
        }
      } as any
    }));
  };

  const handleDiscountChange = (rate: number) => {
    const newPrice = { ...formData.price };
    (['3m', '6m', '12m'] as const).forEach(term => {
      const monthly = newPrice?.[term]?.monthly || 0;
      (newPrice as any)[term] = {
        monthly,
        full: updateFullPrice(monthly, term, rate)
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
    if (!formData.type || !formData.serialNumber || !formData.typeCode) {
      toast({
        variant: 'destructive',
        title: '入力エラー',
        description: '機器名、シリアル番号、タイプコードは必須です。'
      });
      return;
    }
    onSave(formData, imageFile);
  };

  return (
    <div className="space-y-6 p-1 max-h-[70vh] overflow-y-auto pr-4">
      {/* Cover Image */}
      <div className="space-y-3">
        <Label className="text-base font-bold flex items-center gap-2">
          <ImageIcon className="h-4 w-4" /> カバー画像
        </Label>
        <div className="flex items-start gap-4">
          <div
            className="relative w-40 h-28 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreview ? (
              <>
                <Image src={imagePreview} alt="Preview" fill className="object-cover" />
                <button
                  type="button"
                  className="absolute top-1 right-1 h-5 w-5 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 z-10"
                  onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(formData.imageUrl || null); }}
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : (
              <div className="text-center p-2">
                <Upload className="h-6 w-6 text-gray-400 mx-auto mb-1" />
                <p className="text-[9px] text-gray-400">クリックで選択</p>
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>デバイスカタログに表示されるカバー画像</p>
            <p>推奨: 800×600px以上、5MB以下</p>
            <p>対応形式: JPG, PNG, WebP</p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
      </div>

      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="type">機器名（表示用）</Label>
          <Input
            id="type"
            placeholder="例: TimeWaver Mobile"
            value={formData.type || ''}
            onChange={(e) => handleChange('type', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="serialNumber">シリアル番号</Label>
          <Input id="serialNumber" value={formData.serialNumber || ''} onChange={(e) => handleChange('serialNumber', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="typeCode">タイプコード</Label>
          <Select value={formData.typeCode as string} onValueChange={(v) => handleChange('typeCode', v)}>
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
        <div className="space-y-1.5">
          <Label htmlFor="status">ステータス</Label>
          <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
            <SelectTrigger>
              <SelectValue placeholder="ステータスを選択..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">利用可能</SelectItem>
              <SelectItem value="active">使用中</SelectItem>
              <SelectItem value="maintenance">メンテナンス中</SelectItem>
              <SelectItem value="processing">契約処理中</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">説明</Label>
        <Textarea id="description" placeholder="機器の説明..." value={formData.description || ''} onChange={(e) => handleChange('description', e.target.value)} className="min-h-[80px]" />
      </div>

      {/* Pricing */}
      <div className="space-y-4 pt-2 border-t">
        <div className="flex items-center justify-between">
          <Label className="text-base font-bold">料金プラン設定</Label>
          <div className="flex items-center gap-2">
            <Label htmlFor="discount" className="text-xs text-muted-foreground">一括払い割引率</Label>
            <div className="flex items-center gap-1">
              <Input
                id="discount"
                type="number"
                className="w-16 h-8 text-center text-sm"
                value={formData.fullPaymentDiscountRate ?? 0}
                onChange={(e) => handleDiscountChange(Number(e.target.value) || 0)}
              />
              <Percent className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {(['3m', '6m', '12m'] as const).map((term) => {
            const months = term === '3m' ? 3 : term === '6m' ? 6 : 12;
            const monthly = formData.price?.[term]?.monthly || 0;
            const full = formData.price?.[term]?.full || 0;
            return (
              <div key={term} className="grid grid-cols-[80px_1fr_1fr] gap-3 items-center">
                <span className="text-sm font-semibold text-primary">{months}ヶ月</span>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">月額</Label>
                  <Input
                    type="number"
                    value={monthly}
                    onChange={(e) => handleMonthlyPriceChange(term, e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">一括（自動計算）</Label>
                  <Input
                    type="number"
                    value={full}
                    disabled
                    className="h-9 bg-gray-50"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stripe Integration — read-only display of synced IDs */}
      {formData.stripeProducts && Object.values(formData.stripeProducts).some(p => p?.productId) && (
        <div className="space-y-4 pt-2 border-t">
          <Label className="text-base font-bold flex items-center gap-2">
            Stripe連携
            <span className="text-[10px] font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded-full">同期済み</span>
          </Label>
          <div className="space-y-3">
            {(['3m', '6m', '12m'] as const).map((term) => {
              const months = term === '3m' ? 3 : term === '6m' ? 6 : 12;
              const sp = formData.stripeProducts?.[term];
              if (!sp?.productId) return null;
              return (
                <div key={term} className="p-3 rounded-xl bg-gray-50 border space-y-1">
                  <span className="text-xs font-semibold text-primary">{months}ヶ月プラン</span>
                  <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-muted-foreground">
                    <div><span className="text-[9px] text-gray-400">Product:</span> {sp.productId}</div>
                    <div><span className="text-[9px] text-gray-400">月額Price:</span> {sp.monthlyPriceId || '-'}</div>
                    <div><span className="text-[9px] text-gray-400">一括Price:</span> {sp.fullPriceId || '-'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modules */}
      {deviceModules.length > 0 && (
        <div className="space-y-3 pt-2 border-t">
          <Label className="text-base font-bold">対応モジュール</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {deviceModules.map((mod) => {
              const isSelected = (formData.modules || []).some(m => m.id === mod.id);
              return (
                <label
                  key={mod.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => handleModuleToggle(mod.id)}
                  />
                  <div>
                    <div className="text-sm font-medium">{mod.name}</div>
                    {mod.description && <div className="text-[10px] text-muted-foreground">{mod.description}</div>}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Package Contents */}
      <div className="space-y-3 pt-2 border-t">
        <Label className="text-base font-bold">パッケージ内容</Label>
        <div className="space-y-2">
          {(formData.packageContents || []).map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={item}
                onChange={(e) => {
                  const updated = [...(formData.packageContents || [])];
                  updated[i] = e.target.value;
                  handleChange('packageContents', updated);
                }}
                className="h-9"
              />
              <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive shrink-0" onClick={() => {
                const updated = [...(formData.packageContents || [])];
                updated.splice(i, 1);
                handleChange('packageContents', updated);
              }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full" onClick={() => {
            handleChange('packageContents', [...(formData.packageContents || []), '']);
          }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> 項目を追加
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>キャンセル</Button>
        <Button onClick={handleSave} className="px-8 shadow-lg">保存する</Button>
      </div>
    </div>
  );
};
