'use client';

import AuthCheck from '@/components/AuthCheck';
import Sidebar from '@/components/Sidebar';
import NotionHeader from '@/components/NotionHeader';
import NotionContent from '@/components/NotionContent';

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <AuthCheck>
        <div className="flex">
          <Sidebar />
          <div className="ml-64 flex-1">
            <NotionHeader />
            <NotionContent />
          </div>
        </div>
      </AuthCheck>
    </main>
  );
}
