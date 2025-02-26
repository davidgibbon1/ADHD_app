'use client';

import { useState } from 'react';
import AuthCheck from '@/components/AuthCheck';
import Sidebar from '@/components/Sidebar';
import NotionHeader from '@/components/NotionHeader';
import { Clock, Plus, X, Save } from 'lucide-react';

interface WorkingTime {
  id: number;
  day: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export default function WorkingTimes() {
  const [workingTimes, setWorkingTimes] = useState<WorkingTime[]>([
    { id: 1, day: 'Monday', startTime: '09:00', endTime: '17:00', isActive: true },
    { id: 2, day: 'Tuesday', startTime: '09:00', endTime: '17:00', isActive: true },
    { id: 3, day: 'Wednesday', startTime: '09:00', endTime: '17:00', isActive: true },
    { id: 4, day: 'Thursday', startTime: '09:00', endTime: '17:00', isActive: true },
    { id: 5, day: 'Friday', startTime: '09:00', endTime: '15:00', isActive: true },
    { id: 6, day: 'Saturday', startTime: '10:00', endTime: '14:00', isActive: false },
    { id: 7, day: 'Sunday', startTime: '10:00', endTime: '14:00', isActive: false },
  ]);
  const [saveMessage, setSaveMessage] = useState('');

  const handleToggleDay = (id: number) => {
    setWorkingTimes(
      workingTimes.map(time => 
        time.id === id ? { ...time, isActive: !time.isActive } : time
      )
    );
  };

  const handleTimeChange = (id: number, field: 'startTime' | 'endTime', value: string) => {
    setWorkingTimes(
      workingTimes.map(time => 
        time.id === id ? { ...time, [field]: value } : time
      )
    );
  };

  const calculateTotalHours = () => {
    return workingTimes
      .filter(time => time.isActive)
      .reduce((total, time) => {
        const start = new Date(`2000-01-01T${time.startTime}`);
        const end = new Date(`2000-01-01T${time.endTime}`);
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        return total + diffHours;
      }, 0);
  };

  const handleSave = () => {
    // In a real app, we would save these settings to a database or local storage
    setSaveMessage('Working times saved successfully!');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  return (
    <main className="min-h-screen bg-background">
      <AuthCheck>
        <div className="flex">
          <Sidebar />
          <div className="ml-64 flex-1">
            <NotionHeader />
            <div className="fixed bottom-0 left-64 right-0 top-16 overflow-y-auto bg-[#191919] p-6">
              <div className="mx-auto max-w-3xl">
                <div className="mb-8 flex items-center">
                  <Clock size={24} className="mr-3 text-purple-500" />
                  <h1 className="text-3xl font-bold text-white">Set Working Times</h1>
                </div>

                {saveMessage && (
                  <div className="mb-4 rounded-md bg-green-500/20 p-3 text-green-400">
                    {saveMessage}
                  </div>
                )}

                <p className="mb-8 text-white/70">
                  Define your working hours for each day of the week to help schedule your tasks effectively.
                </p>

                <div className="mb-8 rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white">Weekly Schedule</h2>
                    <div className="text-sm text-white/70">
                      Total: {calculateTotalHours().toFixed(1)} hours/week
                    </div>
                  </div>

                  <div className="space-y-4">
                    {workingTimes.map(time => (
                      <div 
                        key={time.id} 
                        className={`rounded-lg border p-4 transition-colors ${
                          time.isActive 
                            ? 'border-purple-500/30 bg-purple-500/10' 
                            : 'border-white/10 bg-white/5 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={time.isActive}
                              onChange={() => handleToggleDay(time.id)}
                              className="mr-3 h-4 w-4 rounded border-white/30 bg-white/10 text-purple-600 focus:ring-purple-500"
                            />
                            <span className="font-medium text-white">{time.day}</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={time.startTime}
                              onChange={(e) => handleTimeChange(time.id, 'startTime', e.target.value)}
                              disabled={!time.isActive}
                              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                            />
                            <span className="text-white">to</span>
                            <input
                              type="time"
                              value={time.endTime}
                              onChange={(e) => handleTimeChange(time.id, 'endTime', e.target.value)}
                              disabled={!time.isActive}
                              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
                  <h2 className="mb-4 text-xl font-semibold text-white">Productivity Tips</h2>
                  <ul className="list-inside list-disc space-y-2 text-white/70">
                    <li>Set realistic working hours that match your energy levels</li>
                    <li>Include buffer time between work sessions</li>
                    <li>Schedule your most important tasks during your peak productivity hours</li>
                    <li>Consider time blocking for deep work sessions</li>
                    <li>Don't forget to schedule breaks and time for self-care</li>
                  </ul>
                </div>

                <div className="mt-8 flex justify-end">
                  <button 
                    onClick={handleSave}
                    className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <Save size={16} />
                    <span>Save Working Times</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AuthCheck>
    </main>
  );
} 