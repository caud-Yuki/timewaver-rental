'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { useToast } from '@/hooks/use-toast';

export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handlePermissionError = (error: any) => {
      // In a real development environment, this would surface more detail.
      // For the user, we show a professional error toast.
      toast({
        variant: 'destructive',
        title: 'アクセス権限エラー',
        description: 'この操作を実行する権限がありません。',
      });
      
      // We also throw it so it hits the Next.js error overlay in development
      if (process.env.NODE_ENV === 'development') {
        throw error;
      }
    };

    errorEmitter.on('permission-error', handlePermissionError);
    return () => {
      errorEmitter.removeListener('permission-error', handlePermissionError);
    };
  }, [toast]);

  return null;
}
