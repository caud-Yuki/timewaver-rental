
import React from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const ApplicationsPage = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">マイページ</h1>
          <p className="text-gray-500">レンタル中の機器と申請状況を確認できます</p>
        </div>
        <Button>新しい機器をレンタルする</Button>
      </div>

      <div className="flex border-b mb-6">
        <Link href="/mypage/devices">
          <Button variant="ghost" className="mr-4 text-gray-500">レンタル中の機器</Button>
        </Link>
        <Link href="/mypage/applications">
          <Button variant="ghost" className="text-blue-600 border-b-2 border-blue-600">申請履歴</Button>
        </Link>
      </div>

      <div className="text-center py-20 border border-dashed rounded-lg">
        <div className="text-gray-400 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">申請履歴はありません</h2>
        <p className="text-gray-500 mb-6">現在申請中の機器はありません。</p>
        <Button variant="outline">機器一覧を見る</Button>
      </div>

      <div className="mt-8 p-6 bg-gray-100 rounded-lg">
        <div className="flex items-center">
          <div className="bg-blue-500 text-white rounded-full p-2 mr-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">ご案内</h3>
            <p className="text-sm text-gray-600">
              現在、TimeWaverの最新アップデートが提供されています。レンタル中の機器は自動的に反映されます。操作方法についてご不明点がある場合は、AIコンシェルジュにお気軽にご相談ください。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApplicationsPage;
