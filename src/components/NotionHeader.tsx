'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import Link from 'next/link';
import { 
  Search, 
  Calendar, 
  Clock, 
  Target, 
  MoreHorizontal,
  LogOut,
  Settings
} from 'lucide-react';

export default function NotionHeader() {
  const { user, signOut } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  if (!user) return null;

  const currentTime = new Date();
  const hours = currentTime.getHours();
  let greeting = "Good morning";
  
  if (hours >= 12 && hours < 17) {
    greeting = "Good afternoon";
  } else if (hours >= 17) {
    greeting = "Good evening";
  }

  return (
    <div className="fixed left-64 right-0 top-0 z-20 border-b border-white/10 bg-[#191919] px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{greeting}, {user.displayName || 'User'}</h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Function buttons */}
          <Link href="/focus" className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10">
            <div className="flex items-center gap-2">
              <Target size={16} />
              <span>Set Weekly Focus</span>
            </div>
          </Link>
          
          <Link href="/schedule" className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10">
            <div className="flex items-center gap-2">
              <Calendar size={16} />
              <span>Edit Schedule</span>
            </div>
          </Link>
          
          <Link href="/working-times" className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10">
            <div className="flex items-center gap-2">
              <Clock size={16} />
              <span>Set Working Times</span>
            </div>
          </Link>
          
          {/* Search button */}
          <button className="ml-2 rounded-md bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10">
            <div className="flex items-center gap-2">
              <Search size={16} />
              <span>Search</span>
            </div>
          </button>
          
          {/* More options */}
          <div className="relative">
            <button 
              className="ml-2 rounded-md bg-white/5 p-1.5 text-white hover:bg-white/10"
              onClick={() => setShowDropdown(!showDropdown)}
            >
              <MoreHorizontal size={16} />
            </button>
            
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-48 rounded-md bg-[#262626] py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                <Link
                  href="/settings"
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white/5"
                  onClick={() => setShowDropdown(false)}
                >
                  <Settings size={16} />
                  <span>Settings</span>
                </Link>
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white/5"
                  onClick={signOut}
                >
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 