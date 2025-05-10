'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { 
  FileText, 
  Calendar, 
  Clock, 
  Briefcase,
  Star,
  MoreHorizontal,
  Plus
} from 'lucide-react';
import { format } from 'date-fns';

export default function NotionContent() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('tasks');

  if (!user) return null;

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Mock data for recently visited
  const recentItems = [
    { id: 1, title: 'Weekly tasks - David', icon: <FileText className="text-white" size={20} />, time: '6h ago' },
    { id: 2, title: 'Work', icon: <Briefcase className="text-white" size={20} />, time: '2w ago' },
    { id: 3, title: 'Personal Home', icon: <Star className="text-white" size={20} />, time: '2w ago' },
  ];

  // Mock data for upcoming events
  const upcomingEvents = [
    { 
      id: 1, 
      title: 'Food & bed time routine', 
      time: '7:45 - 8:45 PM', 
      date: today, 
      color: 'bg-orange-500' 
    },
    { 
      id: 2, 
      title: 'Wake up - morning routine', 
      time: '5 - 6 AM', 
      date: tomorrow, 
      color: 'bg-orange-500' 
    },
    { 
      id: 3, 
      title: 'Travel - work on scripts', 
      time: '6 - 7:45 AM', 
      date: tomorrow, 
      color: 'bg-blue-500' 
    },
    { 
      id: 4, 
      title: 'Set up for day: time block calendar, set meetings and get coffee', 
      time: '7:45 - 8:15 AM', 
      date: tomorrow, 
      color: 'bg-pink-500' 
    },
    { 
      id: 5, 
      title: 'meet with someone', 
      time: '', 
      date: tomorrow, 
      color: 'bg-orange-500' 
    },
  ];

  // Mock data for tasks
  const tasks = [
    { id: 1, title: 'Wake up and freshen up', status: 'Done' },
    { id: 2, title: 'Have breakfast', status: 'In progress' },
    { id: 3, title: 'Work or study', status: 'Not started' },
    { id: 4, title: 'Have lunch', status: 'Not started' },
  ];

  return (
    <div className="fixed bottom-0 left-64 right-0 top-16 overflow-y-auto bg-[#191919] p-6">
      <div className="mx-auto max-w-6xl">
        {/* Recently visited section */}
        <div className="mb-8">
          <div className="mb-4 flex items-center">
            <Clock size={16} className="mr-2 text-white/60" />
            <h2 className="text-sm font-medium text-white/60">Recently visited</h2>
          </div>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {recentItems.map(item => (
              <div key={item.id} className="hover-card rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-lg transition-notion">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-md bg-[#303030]">
                      {item.icon}
                    </div>
                    <div className="truncate text-sm font-medium text-white">{item.title}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center text-xs text-white/60">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#303030] text-[10px]">
                    {user.displayName?.charAt(0) || 'U'}
                  </div>
                  <span className="ml-2">{item.time}</span>
                </div>
              </div>
            ))}
            
            {/* Add new card */}
            <div className="hover-card flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/5 p-4 backdrop-blur-lg transition-notion">
              <Plus size={20} className="text-white/60" />
            </div>
          </div>
        </div>
        
        {/* Upcoming events section */}
        <div className="mb-8">
          <div className="mb-4 flex items-center">
            <Calendar size={16} className="mr-2 text-white/60" />
            <h2 className="text-sm font-medium text-white/60">Upcoming events</h2>
          </div>
          
          <div className="space-y-4">
            {/* Today's date */}
            <div className="text-sm font-medium text-red-400">
              Today {format(today, 'MMMM d')}
            </div>
            
            {upcomingEvents
              .filter(event => event.date.getDate() === today.getDate())
              .map(event => (
                <div key={event.id} className="flex items-start">
                  <div className={`mr-3 h-full w-1 rounded-full ${event.color}`}></div>
                  <div>
                    <div className="text-sm font-medium text-white">{event.title}</div>
                    {event.time && <div className="text-xs text-white/60">{event.time}</div>}
                  </div>
                </div>
              ))}
              
            {/* Tomorrow's date */}
            <div className="text-sm font-medium text-white/60">
              Thursday {format(tomorrow, 'MMMM d')}
            </div>
            
            {upcomingEvents
              .filter(event => event.date.getDate() === tomorrow.getDate())
              .map(event => (
                <div key={event.id} className="flex items-start">
                  <div className={`mr-3 h-full w-1 rounded-full ${event.color}`}></div>
                  <div>
                    <div className="text-sm font-medium text-white">{event.title}</div>
                    {event.time && <div className="text-xs text-white/60">{event.time}</div>}
                  </div>
                </div>
              ))}
          </div>
        </div>
        
        {/* Home views section */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center">
              <h2 className="text-sm font-medium text-white/60">Home views</h2>
            </div>
            <button className="rounded p-1 hover:bg-white/5">
              <MoreHorizontal size={16} className="text-white/60" />
            </button>
          </div>
          
          <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-lg">
            <div className="flex border-b border-white/10">
              <button 
                className={`px-4 py-2 text-sm font-medium ${activeTab === 'tasks' ? 'text-white' : 'text-white/60'}`}
                onClick={() => setActiveTab('tasks')}
              >
                Activity
              </button>
              <button 
                className={`px-4 py-2 text-sm font-medium ${activeTab === 'status' ? 'text-white' : 'text-white/60'}`}
                onClick={() => setActiveTab('status')}
              >
                Status
              </button>
            </div>
            
            <div className="p-4">
              <table className="w-full">
                <tbody>
                  {tasks.map(task => (
                    <tr key={task.id} className="border-b border-white/5 last:border-0">
                      <td className="py-3 pl-2 text-sm text-white">{task.title}</td>
                      <td className="py-3 pr-2 text-right text-sm">
                        <span className={`
                          rounded-full px-2 py-1 text-xs
                          ${task.status === 'Done' ? 'bg-green-500/10 text-green-400' : 
                            task.status === 'In progress' ? 'bg-blue-500/10 text-blue-400' : 
                            'bg-gray-500/10 text-gray-400'}
                        `}>
                          {task.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 