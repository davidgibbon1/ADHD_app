'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import AuthCheck from '@/components/AuthCheck';
import Sidebar from '@/components/Sidebar';
import NotionHeader from '@/components/NotionHeader';
import { Save, Moon, Sun, Bell, BellOff } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [focusReminders, setFocusReminders] = useState(true);
  const [scheduleReminders, setScheduleReminders] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');

  const handleSave = () => {
    // In a real app, we would save these settings to a database or local storage
    setSaveMessage('Settings saved successfully!');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  return (
    <AuthCheck>
      <div className="flex h-screen bg-[#121212] text-white">
        <Sidebar />
        <div className="flex-1">
          <NotionHeader />
          <div className="mt-20 px-8 py-6">
            <div className="mx-auto max-w-3xl">
              <h1 className="mb-6 text-3xl font-bold">Settings</h1>
              
              {saveMessage && (
                <div className="mb-4 rounded-md bg-green-500/20 p-3 text-green-400">
                  {saveMessage}
                </div>
              )}
              
              <div className="space-y-8">
                {/* Appearance Settings */}
                <div className="rounded-lg border border-white/10 bg-[#191919] p-6">
                  <h2 className="mb-4 text-xl font-semibold">Appearance</h2>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {darkMode ? <Moon size={20} /> : <Sun size={20} />}
                      <span>Dark Mode</span>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input 
                        type="checkbox" 
                        className="peer sr-only" 
                        checked={darkMode}
                        onChange={() => setDarkMode(!darkMode)}
                      />
                      <div className="peer h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full"></div>
                    </label>
                  </div>
                </div>
                
                {/* Notification Settings */}
                <div className="rounded-lg border border-white/10 bg-[#191919] p-6">
                  <h2 className="mb-4 text-xl font-semibold">Notifications</h2>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {notifications ? <Bell size={20} /> : <BellOff size={20} />}
                        <span>Enable Notifications</span>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input 
                          type="checkbox" 
                          className="peer sr-only" 
                          checked={notifications}
                          onChange={() => setNotifications(!notifications)}
                        />
                        <div className="peer h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full"></div>
                      </label>
                    </div>
                    
                    {notifications && (
                      <>
                        <div className="ml-8 flex items-center justify-between">
                          <span>Focus Area Reminders</span>
                          <label className="relative inline-flex cursor-pointer items-center">
                            <input 
                              type="checkbox" 
                              className="peer sr-only" 
                              checked={focusReminders}
                              onChange={() => setFocusReminders(!focusReminders)}
                            />
                            <div className="peer h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full"></div>
                          </label>
                        </div>
                        
                        <div className="ml-8 flex items-center justify-between">
                          <span>Schedule Reminders</span>
                          <label className="relative inline-flex cursor-pointer items-center">
                            <input 
                              type="checkbox" 
                              className="peer sr-only" 
                              checked={scheduleReminders}
                              onChange={() => setScheduleReminders(!scheduleReminders)}
                            />
                            <div className="peer h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full"></div>
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Account Settings */}
                <div className="rounded-lg border border-white/10 bg-[#191919] p-6">
                  <h2 className="mb-4 text-xl font-semibold">Account</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm text-white/70">Email</label>
                      <input 
                        type="email" 
                        value={user?.email || ''} 
                        disabled
                        className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                      />
                    </div>
                    
                    <div>
                      <label className="mb-1 block text-sm text-white/70">Display Name</label>
                      <input 
                        type="text" 
                        value={user?.displayName || ''} 
                        disabled
                        className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                      />
                      <p className="mt-1 text-xs text-white/50">To change your display name, update your profile settings.</p>
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={handleSave}
                  className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-700"
                >
                  <Save size={18} />
                  <span>Save Settings</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthCheck>
  );
} 