'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { useToast } from '@/hooks/use-toast';

/**
 * Listens for specialized FirestorePermissionErrors and displays a toast.
 * In production, it silences the error to prevent app crashes.
 * In development, it logs the error for debugging without throwing.
 */
export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handlePermissionError = (error: any) => {
      // Show a professional error toast to the user
      toast({
        variant: 'destructive',
        title: 'アクセス権限エラー',
        description: 'この操作を実行する権限がないか、セッションが切断されました。',
      });
      
      // Log to console for debugging instead of throwing to prevent 500 errors
      console.error('Firebase Permission Error:', error.message);
    };

    errorEmitter.on('permission-error', handlePermissionError);
    return () => {
      errorEmitter.removeListener('permission-error', handlePermissionError);
    };
  }, [toast]);

  return null;
}
