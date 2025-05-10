'use client';

import { useState } from 'react';
import AuthCheck from '@/components/AuthCheck';
import Sidebar from '@/components/Sidebar';
import NotionHeader from '@/components/NotionHeader';
import { Target, Plus, X } from 'lucide-react';

export default function WeeklyFocus() {
  const [focusAreas, setFocusAreas] = useState([
    { id: 1, title: 'Complete project proposal', priority: 'high' },
    { id: 2, title: 'Research new technologies', priority: 'medium' },
    { id: 3, title: 'Exercise 3 times this week', priority: 'medium' },
  ]);
  const [newFocus, setNewFocus] = useState('');
  const [newPriority, setNewPriority] = useState('medium');

  const handleAddFocus = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFocus.trim()) {
      setFocusAreas([
        ...focusAreas,
        {
          id: Date.now(),
          title: newFocus,
          priority: newPriority as 'high' | 'medium' | 'low',
        },
      ]);
      setNewFocus('');
    }
  };

  const handleRemoveFocus = (id: number) => {
    setFocusAreas(focusAreas.filter(focus => focus.id !== id));
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
                  <Target size={24} className="mr-3 text-purple-500" />
                  <h1 className="text-3xl font-bold text-white">Weekly Focus</h1>
                </div>

                <p className="mb-8 text-white/70">
                  Set your focus areas for the week to stay on track with your most important goals.
                </p>

                <div className="mb-8 rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
                  <h2 className="mb-4 text-xl font-semibold text-white">This Week's Focus Areas</h2>
                  
                  <div className="mb-6 space-y-3">
                    {focusAreas.map(focus => (
                      <div 
                        key={focus.id} 
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3"
                      >
                        <div className="flex items-center">
                          <div 
                            className={`mr-3 h-3 w-3 rounded-full ${
                              focus.priority === 'high' ? 'bg-red-500' : 
                              focus.priority === 'medium' ? 'bg-yellow-500' : 
                              'bg-green-500'
                            }`}
                          />
                          <span className="text-white">{focus.title}</span>
                        </div>
                        <button 
                          onClick={() => handleRemoveFocus(focus.id)}
                          className="text-white/60 hover:text-white"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleAddFocus} className="flex gap-2">
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <input
                      type="text"
                      value={newFocus}
                      onChange={(e) => setNewFocus(e.target.value)}
                      placeholder="Add a new focus area..."
                      className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      type="submit"
                      className="flex items-center gap-1 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <Plus size={16} />
                      <span>Add</span>
                    </button>
                  </form>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
                  <h2 className="mb-4 text-xl font-semibold text-white">Tips for Setting Focus</h2>
                  <ul className="list-inside list-disc space-y-2 text-white/70">
                    <li>Limit yourself to 3-5 focus areas per week</li>
                    <li>Be specific about what you want to accomplish</li>
                    <li>Align your focus areas with your long-term goals</li>
                    <li>Review your focus areas daily</li>
                    <li>Celebrate your progress at the end of the week</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AuthCheck>
    </main>
  );
} 