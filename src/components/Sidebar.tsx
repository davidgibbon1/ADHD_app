'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  Target, 
  Calendar, 
  Clock, 
  Plus, 
  ChevronDown, 
  ChevronRight,
  FileText,
  Settings
} from 'lucide-react';

export default function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [showPages, setShowPages] = useState(true);
  
  if (!user) return null;

  const isActive = (path: string) => {
    return pathname === path ? 'bg-white/10' : 'hover:bg-white/5';
  };

  return (
    <div className="fixed left-0 top-0 z-30 h-screen w-64 bg-[#191919] text-white">
      {/* User section */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-pink-500 text-sm font-bold">
          {user.displayName ? user.displayName[0] : 'U'}
        </div>
        <div className="flex-1 truncate">
          <div className="text-sm font-medium">{user.displayName || 'User'}'s Workspace</div>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-2 py-4">
        <Link href="/" className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive('/')}`}>
          <Home size={18} />
          <span>Home</span>
        </Link>
        
        <Link href="/focus" className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive('/focus')}`}>
          <Target size={18} />
          <span>Weekly Focus</span>
        </Link>
        
        <Link href="/schedule" className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive('/schedule')}`}>
          <Calendar size={18} />
          <span>Schedule</span>
        </Link>
        
        <Link href="/working-times" className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive('/working-times')}`}>
          <Clock size={18} />
          <span>Working Times</span>
        </Link>
        
        <Link href="/settings" className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive('/settings')}`}>
          <Settings size={18} />
          <span>Settings</span>
        </Link>
      </div>

      {/* Pages section */}
      <div className="px-2">
        <div 
          className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-white/5"
          onClick={() => setShowPages(!showPages)}
        >
          <span className="font-medium">Pages</span>
          {showPages ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        
        {showPages && (
          <div className="ml-2 mt-1 space-y-1">
            <Link href="/" className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-white/5">
              <FileText size={16} />
              <span>Getting Started</span>
            </Link>
            <div className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-white/5">
              <Plus size={16} />
              <span>Add a page</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 