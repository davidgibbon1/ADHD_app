'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import Sidebar from '@/components/Sidebar';
import AuthCheck from '@/components/AuthCheck';
import NotionHeader from '@/components/NotionHeader';
import { getOrCreateUserId } from '@/lib/localStorage/storageUtils';
import { Button } from '@/components/ui/button';
import IdealWeek from './ideal-week';
import WeekView from './week-view';

export default function WorkingTimes() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'week' | 'ideal'>('week');
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string>('');
  const [hasWeekUnsavedChanges, setHasWeekUnsavedChanges] = useState(false);
  const [hasIdealUnsavedChanges, setHasIdealUnsavedChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [pendingTabChange, setPendingTabChange] = useState<'week' | 'ideal' | null>(null);

  useEffect(() => {
    if (user) {
      const id = user.uid || getOrCreateUserId();
      setUserId(id);
      setIsLoading(false);
    }
  }, [user]);

  const handleTabChange = (tab: 'week' | 'ideal') => {
    // If trying to switch from week tab with unsaved changes
    if (activeTab === 'week' && tab === 'ideal' && hasWeekUnsavedChanges) {
      setShowUnsavedWarning(true);
      setPendingTabChange('ideal');
      return;
    }
    
    // If trying to switch from ideal tab with unsaved changes
    if (activeTab === 'ideal' && tab === 'week' && hasIdealUnsavedChanges) {
      setShowUnsavedWarning(true);
      setPendingTabChange('week');
      return;
    }
    
    // No unsaved changes, proceed with tab change
    setActiveTab(tab);
  };

  const handleWeekUnsavedChanges = useCallback((hasChanges: boolean) => {
    setHasWeekUnsavedChanges(hasChanges);
  }, []);

  const handleIdealUnsavedChanges = useCallback((hasChanges: boolean) => {
    setHasIdealUnsavedChanges(hasChanges);
  }, []);

  const discardChanges = () => {
    if (pendingTabChange) {
      setActiveTab(pendingTabChange);
      setPendingTabChange(null);
      setShowUnsavedWarning(false);
    }
  };

  const keepEditing = () => {
    setPendingTabChange(null);
    setShowUnsavedWarning(false);
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <AuthCheck>
          <div className="flex">
            <Sidebar />
            <div className="ml-64 flex-1">
              <NotionHeader />
              <div className="fixed bottom-0 left-64 right-0 top-16 overflow-y-auto bg-[#191919] p-6">
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              </div>
            </div>
          </div>
        </AuthCheck>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <AuthCheck>
        <div className="flex">
          <Sidebar />
          <div className="ml-64 flex-1">
            <NotionHeader />
            <div className="fixed bottom-0 left-64 right-0 top-16 overflow-y-auto bg-[#191919] p-6">
              <div className="mx-auto max-w-5xl">
                <div className="mb-8 flex items-center">
                  <Clock size={24} className="mr-3 text-purple-500" />
                  <h1 className="text-3xl font-bold text-white">Time Blocking</h1>
                </div>

                {showUnsavedWarning && (
                  <div className="mb-4 rounded-md bg-yellow-500/20 p-4 text-yellow-400 border border-yellow-500/50">
                    <div className="flex items-start">
                      <AlertCircle className="h-5 w-5 mr-2 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-2">
                          You have unsaved changes. What would you like to do?
                        </p>
                        <div className="flex space-x-3">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={keepEditing}
                            className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
                          >
                            Keep editing
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={discardChanges}
                            className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
                          >
                            Discard changes
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mb-6">
                  <Button
                    variant={activeTab === 'week' ? 'default' : 'outline'}
                    className={activeTab === 'week' ? 'bg-purple-600' : 'bg-[#252525] text-white border-[#333333]'}
                    onClick={() => handleTabChange('week')}
                  >
                    This Week
                  </Button>
                  <Button
                    variant={activeTab === 'ideal' ? 'default' : 'outline'}
                    className={activeTab === 'ideal' ? 'bg-purple-600' : 'bg-[#252525] text-white border-[#333333]'}
                    onClick={() => handleTabChange('ideal')}
                  >
                    Ideal Week Template
                  </Button>
                </div>

                {activeTab === 'week' ? (
                  <WeekView userId={userId} onHasUnsavedChanges={handleWeekUnsavedChanges} />
                ) : (
                  <IdealWeek userId={userId} onHasUnsavedChanges={handleIdealUnsavedChanges} />
                )}
              </div>
            </div>
          </div>
        </div>
      </AuthCheck>
    </main>
  );
} 