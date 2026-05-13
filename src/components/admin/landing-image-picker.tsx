'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { useStorage } from '@/firebase/provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Upload, Trash2, Check, ImagePlus, X
} from 'lucide-react';

const STORAGE_PATH = 'system/landing';
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface StoredImage {
  name: string;
  url: string;
  fullPath: string;
}

interface PickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
  currentUrl?: string;
}

export function LandingImagePicker({ open, onOpenChange, onSelect, currentUrl }: PickerProps) {
  const storage = useStorage();
  const { toast } = useToast();
  const [images, setImages] = useState<StoredImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const folderRef = ref(storage, STORAGE_PATH);
      const result = await listAll(folderRef);
      const items = await Promise.all(
        result.items.map(async (item) => ({
          name: item.name,
          fullPath: item.fullPath,
          url: await getDownloadURL(item),
        }))
      );
      // Filenames are prefixed with timestamps — newest first.
      items.sort((a, b) => b.name.localeCompare(a.name));
      setImages(items);
    } catch (e: any) {
      console.error('Failed to load landing images', e);
      toast({ variant: 'destructive', title: 'エラー', description: '画像一覧の取得に失敗しました' });
    } finally {
      setLoading(false);
    }
  }, [storage, toast]);

  useEffect(() => {
    if (open) loadImages();
  }, [open, loadImages]);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: '画像ファイルのみアップロード可能です' });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast({ variant: 'destructive', title: 'ファイルサイズは5MB以下にしてください' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeBase = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
      const fileName = `${Date.now()}_${safeBase || 'img'}.${ext}`;
      const fileRef = ref(storage, `${STORAGE_PATH}/${fileName}`);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const url = await getDownloadURL(fileRef);
      toast({ title: 'アップロードしました' });
      // Auto-select the newly uploaded image and close.
      onSelect(url);
      onOpenChange(false);
    } catch (e: any) {
      console.error('Upload error', e);
      toast({ variant: 'destructive', title: 'アップロードに失敗しました', description: e.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (img: StoredImage) => {
    if (!window.confirm(`「${img.name}」を削除しますか？\nこの画像を使用中のセクションでは表示されなくなります。`)) return;
    setDeletingPath(img.fullPath);
    try {
      await deleteObject(ref(storage, img.fullPath));
      toast({ title: '削除しました' });
      // If currently-selected image was deleted, clear the selection in caller.
      if (currentUrl === img.url) {
        onSelect('');
      }
      await loadImages();
    } catch (e: any) {
      console.error('Delete error', e);
      toast({ variant: 'destructive', title: '削除に失敗しました', description: e.message });
    } finally {
      setDeletingPath(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>画像を選択</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-2xl border-2 border-dashed border-gray-300 p-6 text-center bg-gray-50/50">
            <input
              type="file"
              accept="image/*"
              id="landing-image-upload-input"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = '';
              }}
              disabled={uploading}
            />
            <label htmlFor="landing-image-upload-input">
              <Button asChild variant="outline" disabled={uploading} className="rounded-xl">
                <span className="cursor-pointer">
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />アップロード中...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" />新しい画像をアップロード</>
                  )}
                </span>
              </Button>
            </label>
            <p className="text-xs text-muted-foreground mt-2">JPG / PNG / WebP、5MBまで</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ImagePlus className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">アップロード済みの画像はまだありません</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground mb-2">クリックで選択 / ホバーすると削除ボタンが表示されます</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {images.map((img) => {
                  const isSelected = img.url === currentUrl;
                  const isDeleting = deletingPath === img.fullPath;
                  return (
                    <div
                      key={img.fullPath}
                      className={`relative group rounded-xl overflow-hidden border-2 ${isSelected ? 'border-primary' : 'border-transparent'} bg-gray-100`}
                    >
                      <button
                        type="button"
                        onClick={() => { onSelect(img.url); onOpenChange(false); }}
                        className="block w-full aspect-square relative hover:opacity-90 transition-opacity"
                        disabled={isDeleting}
                      >
                        <Image
                          src={img.url}
                          alt={img.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                        />
                        {isSelected && (
                          <div className="absolute top-2 left-2 bg-primary text-white rounded-full p-1 shadow">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(img)}
                        disabled={isDeleting}
                        title="この画像を削除"
                        className="absolute top-2 right-2 bg-white/95 hover:bg-red-500 hover:text-white text-red-500 rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                      >
                        {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface FieldProps {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  helperText?: string;
}

/**
 * Form field that displays the current image (or an empty placeholder) and
 * opens the LandingImagePicker modal on click. Also supports clearing the
 * selection without deleting the underlying file.
 */
export function LandingImageField({ label, value, onChange, helperText }: FieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm font-medium">{label}</label>}
      <div className="flex items-start gap-3">
        {value ? (
          <div className="relative w-28 h-28 rounded-xl overflow-hidden border bg-gray-50 shrink-0">
            <Image src={value} alt="選択中の画像" fill className="object-cover" sizes="112px" />
            <button
              type="button"
              onClick={() => onChange('')}
              title="選択を解除（ファイルは削除しません）"
              className="absolute top-1 right-1 bg-white/95 hover:bg-gray-900 hover:text-white text-gray-700 rounded-full p-1 shadow"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="w-28 h-28 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 shrink-0">
            <ImagePlus className="h-6 w-6" />
          </div>
        )}
        <div className="flex-1 space-y-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => setPickerOpen(true)}
          >
            <ImagePlus className="h-4 w-4 mr-2" />
            {value ? '画像を変更' : '画像を選択 / アップロード'}
          </Button>
          {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
        </div>
      </div>
      <LandingImagePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={onChange}
        currentUrl={value}
      />
    </div>
  );
}
