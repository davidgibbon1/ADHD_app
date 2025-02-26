'use client';

import { useState } from 'react';
import AuthCheck from '@/components/AuthCheck';
import Sidebar from '@/components/Sidebar';
import NotionHeader from '@/components/NotionHeader';
import { Calendar as CalendarIcon, Plus, X, Edit2 } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';

interface ScheduleEvent {
  id: number;
  title: string;
  startTime: string;
  endTime: string;
  color: string;
}

export default function Schedule() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<ScheduleEvent[]>([
    { id: 1, title: 'Morning Routine', startTime: '06:00', endTime: '07:00', color: 'bg-blue-500' },
    { id: 2, title: 'Work Session', startTime: '09:00', endTime: '12:00', color: 'bg-purple-500' },
    { id: 3, title: 'Lunch Break', startTime: '12:00', endTime: '13:00', color: 'bg-green-500' },
    { id: 4, title: 'Deep Work', startTime: '13:30', endTime: '16:30', color: 'bg-purple-500' },
    { id: 5, title: 'Exercise', startTime: '17:00', endTime: '18:00', color: 'bg-orange-500' },
  ]);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [newEvent, setNewEvent] = useState<Omit<ScheduleEvent, 'id'>>({
    title: '',
    startTime: '',
    endTime: '',
    color: 'bg-blue-500',
  });

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEvent.title && newEvent.startTime && newEvent.endTime) {
      setEvents([
        ...events,
        {
          id: Date.now(),
          ...newEvent,
        },
      ]);
      setNewEvent({
        title: '',
        startTime: '',
        endTime: '',
        color: 'bg-blue-500',
      });
      setIsAddingEvent(false);
    }
  };

  const handleRemoveEvent = (id: number) => {
    setEvents(events.filter(event => event.id !== id));
  };

  const colorOptions = [
    { value: 'bg-blue-500', label: 'Blue' },
    { value: 'bg-purple-500', label: 'Purple' },
    { value: 'bg-green-500', label: 'Green' },
    { value: 'bg-orange-500', label: 'Orange' },
    { value: 'bg-pink-500', label: 'Pink' },
    { value: 'bg-red-500', label: 'Red' },
  ];

  return (
    <main className="min-h-screen bg-background">
      <AuthCheck>
        <div className="flex">
          <Sidebar />
          <div className="ml-64 flex-1">
            <NotionHeader />
            <div className="fixed bottom-0 left-64 right-0 top-16 overflow-y-auto bg-[#191919] p-6">
              <div className="mx-auto max-w-6xl">
                <div className="mb-8 flex items-center">
                  <CalendarIcon size={24} className="mr-3 text-purple-500" />
                  <h1 className="text-3xl font-bold text-white">Edit Schedule</h1>
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                  {/* Calendar */}
                  <div className="rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
                    <h2 className="mb-4 text-xl font-semibold text-white">Select Date</h2>
                    <div className="flex justify-center">
                      <DayPicker
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => date && setSelectedDate(date)}
                        className="rdp-custom"
                        classNames={{
                          day_selected: "rdp-day_selected",
                          day_today: "rdp-day_today",
                          button: "rdp-button",
                          head_cell: "rdp-head_cell",
                          nav_button: "rdp-nav_button",
                          caption_label: "rdp-caption_label"
                        }}
                      />
                    </div>
                  </div>

                  {/* Schedule for selected date */}
                  <div className="col-span-2 rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-white">
                        Schedule for {format(selectedDate, 'MMMM d, yyyy')}
                      </h2>
                      <button
                        onClick={() => setIsAddingEvent(true)}
                        className="flex items-center gap-1 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
                      >
                        <Plus size={16} />
                        <span>Add Event</span>
                      </button>
                    </div>

                    {/* Events list */}
                    <div className="mb-6 space-y-3">
                      {events.length === 0 ? (
                        <p className="text-center text-white/60">No events scheduled for this day</p>
                      ) : (
                        events
                          .sort((a, b) => a.startTime.localeCompare(b.startTime))
                          .map(event => (
                            <div
                              key={event.id}
                              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3"
                            >
                              <div className="flex items-center">
                                <div className={`mr-3 h-full w-1 rounded-full ${event.color}`} />
                                <div>
                                  <div className="font-medium text-white">{event.title}</div>
                                  <div className="text-sm text-white/60">
                                    {event.startTime} - {event.endTime}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button className="text-white/60 hover:text-white">
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleRemoveEvent(event.id)}
                                  className="text-white/60 hover:text-white"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </div>
                          ))
                      )}
                    </div>

                    {/* Add event form */}
                    {isAddingEvent && (
                      <form onSubmit={handleAddEvent} className="rounded-lg border border-white/10 bg-white/10 p-4">
                        <h3 className="mb-4 text-lg font-medium text-white">Add New Event</h3>
                        
                        <div className="mb-4">
                          <label className="mb-1 block text-sm font-medium text-white/70">Event Title</label>
                          <input
                            type="text"
                            value={newEvent.title}
                            onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="Enter event title"
                            required
                          />
                        </div>
                        
                        <div className="mb-4 grid grid-cols-2 gap-4">
                          <div>
                            <label className="mb-1 block text-sm font-medium text-white/70">Start Time</label>
                            <input
                              type="time"
                              value={newEvent.startTime}
                              onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                              required
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-white/70">End Time</label>
                            <input
                              type="time"
                              value={newEvent.endTime}
                              onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                              required
                            />
                          </div>
                        </div>
                        
                        <div className="mb-4">
                          <label className="mb-1 block text-sm font-medium text-white/70">Color</label>
                          <select
                            value={newEvent.color}
                            onChange={(e) => setNewEvent({ ...newEvent, color: e.target.value })}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                          >
                            {colorOptions.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setIsAddingEvent(false)}
                            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          >
                            Add Event
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AuthCheck>
    </main>
  );
} 