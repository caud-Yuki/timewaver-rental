'use client';

import { useEffect } from 'react';

export default function GmailOAuthCallbackPage() {
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.close();
      } catch (_) {
        /* ignore */
      }
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <h1 className="text-lg font-bold text-green-600 mb-3">認証完了</h1>
        <p className="text-sm text-gray-600 leading-relaxed">
          Gmail アカウントの認証が完了しました。
          <br />
          このウィンドウは自動的に閉じます。
        </p>
      </div>
    </div>
  );
}
