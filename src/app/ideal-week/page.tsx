'use client';

import { useState, useEffect, useRef } from 'react';
import { Clock, Plus, AlertCircle, Calendar as CalendarIcon, Save } from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks, subWeeks, addDays } from 'date-fns';
import { useAuth } from '@/lib/hooks/useAuth';
import Sidebar from '@/components/Sidebar';
import AuthCheck from '@/components/AuthCheck';
import NotionHeader from '@/components/NotionHeader';
import { getOrCreateUserId } from '@/lib/localStorage/storageUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Define a color map for time blocks
const COLORS = [
  { name: 'Purple', color: '#8B5CF6' },
  { name: 'Blue', color: '#3B82F6' },
  { name: 'Green', color: '#22C55E' },
  { name: 'Yellow', color: '#EAB308' },
  { name: 'Red', color: '#EF4444' },
  { name: 'Pink', color: '#EC4899' },
  { name: 'Indigo', color: '#6366F1' },
  { name: 'Cyan', color: '#06B6D4' },
];

// Calendar view constants
const TIME_SLOTS = Array.from({ length: 21 }, (_, i) => i + 3); // 3 AM to 11 PM

// Interfaces
interface TimeBlock {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
  color: string;
  label: string;
  isIdealWeek: boolean;
}

interface DraggingState {
  active: boolean;
  startX: number;
  startY: number;
  dayIndex: number;
  hourIndex: number;
  timeBlock?: TimeBlock;
  isResizing: boolean;
  resizeEdge?: 'top' | 'bottom';
}

export default function IdealWeek() {
  const { user } = useAuth();
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [selectedColor, setSelectedColor] = useState<string>(COLORS[0].color);
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [editingTimeBlock, setEditingTimeBlock] = useState<TimeBlock | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'thisWeek' | 'idealWeek'>('thisWeek');
  const [blockLabel, setBlockLabel] = useState('');
  const calendarRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DraggingState>({
    active: false,
    startX: 0,
    startY: 0,
    dayIndex: 0,
    hourIndex: 0,
    isResizing: false
  });

  // Load existing time blocks when component mounts
  useEffect(() => {
    if (user) {
      loadTimeBlocks();
    }
  }, [user, viewMode]);

  // Handle mouse events for calendar interactions
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.active) return;
      
      if (calendarRef.current) {
        const rect = calendarRef.current.getBoundingClientRect();
        const gridWidth = rect.width / 8; // 8 columns (time + 7 days)
        const gridHeight = rect.height / TIME_SLOTS.length;
        
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Calculate grid positions
        const dayIndex = Math.min(Math.max(Math.floor(mouseX / gridWidth) - 1, 0), 6);
        
        if (dragging.isResizing && dragging.timeBlock) {
          // Handle resizing
          const hourIndex = Math.min(Math.max(Math.floor(mouseY / gridHeight), 0), TIME_SLOTS.length - 1);
          const hour = TIME_SLOTS[hourIndex];
          
          if (dragging.resizeEdge === 'top') {
            // Resizing from top
            const endHour = parseInt(dragging.timeBlock.endTime.split(':')[0]);
            if (hour < endHour) {
              setTimeBlocks(blocks => blocks.map(block => 
                block.id === dragging.timeBlock?.id
                  ? { ...block, startTime: `${hour.toString().padStart(2, '0')}:00` }
                  : block
              ));
            }
          } else if (dragging.resizeEdge === 'bottom') {
            // Resizing from bottom
            const startHour = parseInt(dragging.timeBlock.startTime.split(':')[0]);
            if (hour > startHour) {
              setTimeBlocks(blocks => blocks.map(block => 
                block.id === dragging.timeBlock?.id
                  ? { ...block, endTime: `${hour.toString().padStart(2, '0')}:00` }
                  : block
              ));
            }
          }
        } else {
          // Handle dragging/creating
          const startDayIndex = dragging.dayIndex;
          const startHour = TIME_SLOTS[dragging.hourIndex];
          const currentHour = TIME_SLOTS[Math.min(Math.max(Math.floor(mouseY / gridHeight), 0), TIME_SLOTS.length - 1)];
          
          // Determine range
          const startTime = Math.min(startHour, currentHour);
          const endTime = Math.max(startHour, currentHour) + 1;
          
          if (dragging.timeBlock) {
            // Update existing time block
            setTimeBlocks(blocks => blocks.map(block => 
              block.id === dragging.timeBlock?.id
                ? { 
                    ...block, 
                    startTime: `${startTime.toString().padStart(2, '0')}:00`,
                    endTime: `${endTime.toString().padStart(2, '0')}:00`
                  }
                : block
            ));
          }
        }
      }
    };
    
    const handleMouseUp = () => {
      if (dragging.active) {
        setDragging({
          active: false,
          startX: 0,
          startY: 0,
          dayIndex: 0,
          hourIndex: 0,
          isResizing: false
        });
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  const loadTimeBlocks = async () => {
    try {
      setIsLoading(true);
      const userId = user?.uid || getOrCreateUserId();
      
      // Fetch time blocks from the database
      const response = await fetch(`/api/time-blocks?userId=${userId}&isIdealWeek=${viewMode === 'idealWeek'}`);
      
      if (response.ok) {
        const data = await response.json();
        setTimeBlocks(data.timeBlocks || []);
      } else {
        throw new Error('Failed to load time blocks');
      }
    } catch (err) {
      console.error('Error loading time blocks:', err);
      setError('Failed to load time blocks');
    } finally {
      setIsLoading(false);
    }
  };

  // Start creating a new time block
  const startTimeBlockCreation = (dayIndex: number, hourIndex: number) => {
    const dayOfWeek = getDaysOfWeek()[dayIndex];
    const dayName = format(dayOfWeek, 'EEEE').toLowerCase();
    const hour = TIME_SLOTS[hourIndex];
    
    // Create a new time block
    const newTimeBlock: TimeBlock = {
      id: `tb-${Date.now()}`,
      day: dayName,
      startTime: `${hour.toString().padStart(2, '0')}:00`,
      endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
      enabled: true,
      color: selectedColor,
      label: blockLabel || 'Untitled',
      isIdealWeek: viewMode === 'idealWeek'
    };
    
    // Add it to the list
    setTimeBlocks([...timeBlocks, newTimeBlock]);
    
    // Set up dragging state
    setDragging({
      active: true,
      startX: 0,
      startY: 0,
      dayIndex,
      hourIndex,
      timeBlock: newTimeBlock,
      isResizing: false
    });
  };

  // Start resizing a time block
  const startResizeTimeBlock = (timeBlock: TimeBlock, edge: 'top' | 'bottom', e: React.MouseEvent) => {
    e.stopPropagation();
    
    setDragging({
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      dayIndex: getDaysOfWeek().findIndex(day => 
        format(day, 'EEEE').toLowerCase() === timeBlock.day
      ),
      hourIndex: 0,
      timeBlock,
      isResizing: true,
      resizeEdge: edge
    });
  };

  const removeTimeBlock = (id: string) => {
    setTimeBlocks(timeBlocks.filter(block => block.id !== id));
    if (editingTimeBlock && editingTimeBlock.id === id) {
      setEditingTimeBlock(null);
    }
  };

  // Calendar navigation functions
  const goToPreviousWeek = () => {
    setWeekStart(subWeeks(weekStart, 1));
  };

  const goToNextWeek = () => {
    setWeekStart(addWeeks(weekStart, 1));
  };

  const goToToday = () => {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  };

  // Get days of the current week
  const getDaysOfWeek = () => {
    if (viewMode === 'idealWeek') {
      // For ideal week, create a generic week starting from Monday
      const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    } else {
      // For this week, use actual dates
      const start = weekStart;
      const end = endOfWeek(start, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    }
  };
  
  // Format day name
  const formatDayHeader = (date: Date) => {
    if (viewMode === 'idealWeek') {
      return format(date, 'EEE');
    } else {
      return (
        <>
          <div className="text-sm">{format(date, 'EEE')}</div>
          <div className="text-lg font-bold">{format(date, 'd')}</div>
        </>
      );
    }
  };

  // Toggle between view modes
  const toggleViewMode = () => {
    setViewMode(prev => prev === 'thisWeek' ? 'idealWeek' : 'thisWeek');
  };

  // Save all time blocks
  const handleSave = async () => {
    if (!user) return;

    try {
      const userId = user.uid || getOrCreateUserId();
      
      // Send time blocks to the API
      const saveResponse = await fetch('/api/time-blocks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          timeBlocks: timeBlocks.map(block => ({
            ...block,
            isIdealWeek: viewMode === 'idealWeek'
          }))
        }),
      });

      if (saveResponse.ok) {
        setSaveMessage('Time blocks saved successfully!');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        throw new Error('Failed to save time blocks');
      }
    } catch (err) {
      console.error('Error saving time blocks:', err);
      setError('Failed to save time blocks');
      setTimeout(() => setError(''), 3000);
    }
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
                <div className="mb-8 flex items-center justify-between">
                  <div className="flex items-center">
                    <Clock size={24} className="mr-3 text-purple-500" />
                    <h1 className="text-3xl font-bold text-white">
                      {viewMode === 'idealWeek' ? 'Ideal Week Schedule' : 'Weekly Schedule'}
                    </h1>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm ${viewMode === 'thisWeek' ? 'text-white' : 'text-white/50'}`}>Real Calendar</span>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={toggleViewMode}
                        className="px-3 h-8 bg-[#252525] border-[#333333] text-white hover:bg-purple-900/20"
                      >
                        {viewMode === 'idealWeek' ? 'Switch to Real Week' : 'Switch to Ideal Week'}
                      </Button>
                      <span className={`text-sm ${viewMode === 'idealWeek' ? 'text-white' : 'text-white/50'}`}>Ideal Week</span>
                    </div>
                    
                    <Button
                      onClick={handleSave}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Schedule
                    </Button>
                  </div>
                </div>

                {saveMessage && (
                  <div className="mb-4 rounded-md bg-green-500/20 p-3 text-green-400">
                    {saveMessage}
                  </div>
                )}

                {error && (
                  <div className="mb-4 rounded-md bg-red-500/20 p-3 text-red-400">
                    <div className="flex items-center">
                      <AlertCircle className="h-4 w-4 mr-2" />
                      {error}
                    </div>
                  </div>
                )}

                <p className="mb-6 text-white/70">
                  {viewMode === 'idealWeek' 
                    ? 'Design your ideal week schedule as a template for recurring activities and habits.'
                    : 'Schedule your week with time blocks for specific activities and projects.'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {/* Sidebar with color selection and time block details */}
                  <div className="md:col-span-1">
                    <Card className="bg-[#1E1E1E] border-[#333333] text-white h-full">
                      <CardHeader>
                        <CardTitle>Time Blocks</CardTitle>
                        <CardDescription className="text-white/70">
                          Create and manage your time blocks
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-1 text-white/70">
                              Block Label
                            </label>
                            <input
                              type="text"
                              value={blockLabel}
                              onChange={(e) => setBlockLabel(e.target.value)}
                              placeholder="E.g., Deep Work, Exercise, Family Time"
                              className="w-full bg-[#252525] border border-[#333333] rounded-md p-2 text-white"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium mb-1 text-white/70">
                              Block Color
                            </label>
                            <div className="grid grid-cols-4 gap-2 mt-2">
                              {COLORS.map((color) => (
                                <button
                                  key={color.name}
                                  className={`w-8 h-8 rounded-md focus:outline-none focus:ring-2 ring-white/30 transition-all ${
                                    selectedColor === color.color ? 'ring-2 ring-white' : ''
                                  }`}
                                  style={{ backgroundColor: color.color }}
                                  onClick={() => setSelectedColor(color.color)}
                                  title={color.name}
                                />
                              ))}
                            </div>
                          </div>
                          
                          <div className="mt-4">
                            <h3 className="font-medium text-white mb-2">Your Time Blocks</h3>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto">
                              {timeBlocks.length > 0 ? (
                                timeBlocks.map(block => (
                                  <div 
                                    key={block.id} 
                                    className="flex items-center justify-between bg-[#252525] border border-[#333333] rounded-md p-3"
                                    style={{ 
                                      borderLeft: `4px solid ${block.color || '#CCCCCC'}` 
                                    }}
                                  >
                                    <div>
                                      <div className="font-medium text-white capitalize">
                                        {block.label || 'Untitled'}
                                      </div>
                                      <div className="text-sm text-white/70 capitalize">
                                        {block.day}
                                      </div>
                                      <div className="text-xs text-white/50">
                                        {block.startTime} - {block.endTime}
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-400 hover:text-red-300 hover:bg-red-950/20"
                                      onClick={() => removeTimeBlock(block.id)}
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                ))
                              ) : (
                                <div className="text-white/50 text-center p-4 border border-dashed border-[#333333] rounded-md bg-[#252525]">
                                  No time blocks yet. Click and drag on the calendar to create one.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {/* Calendar view */}
                  <div className="md:col-span-3">
                    <Card className="bg-[#1E1E1E] border-[#333333] text-white">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center">
                            <CalendarIcon className="h-5 w-5 mr-2" />
                            {viewMode === 'idealWeek' ? 'Ideal Week Template' : 'Weekly Calendar'}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={goToToday}
                              className="h-8 bg-[#252525] border-[#333333] text-white"
                              disabled={viewMode === 'idealWeek'}
                            >
                              Today
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={goToPreviousWeek}
                              className="h-8 w-8 bg-[#252525] border-[#333333] text-white"
                              disabled={viewMode === 'idealWeek'}
                            >
                              <span className="sr-only">Previous week</span>
                              <span aria-hidden>‹</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={goToNextWeek}
                              className="h-8 w-8 bg-[#252525] border-[#333333] text-white"
                              disabled={viewMode === 'idealWeek'}
                            >
                              <span className="sr-only">Next week</span>
                              <span aria-hidden>›</span>
                            </Button>
                          </div>
                        </div>
                        <CardDescription className="text-white/70">
                          {viewMode === 'idealWeek' 
                            ? 'Click and drag to create time blocks for your ideal week template' 
                            : 'Click and drag to schedule time blocks for this week'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {/* Calendar grid */}
                        <div 
                          ref={calendarRef}
                          className="bg-[#252525] border border-[#333333] rounded-md overflow-hidden"
                        >
                          {/* Calendar header */}
                          <div className="grid grid-cols-8 border-b border-[#333333]">
                            <div className="p-2 text-center text-white/50 text-xs">
                              Time
                            </div>
                            {getDaysOfWeek().map((day, index) => (
                              <div
                                key={index}
                                className={`p-2 text-center ${
                                  viewMode === 'thisWeek' && isSameDay(day, new Date())
                                    ? "bg-purple-500/20 text-white"
                                    : "text-white"
                                }`}
                              >
                                {formatDayHeader(day)}
                              </div>
                            ))}
                          </div>
                          
                          {/* Time grid */}
                          <div className="grid grid-cols-8">
                            {/* Time labels */}
                            <div className="border-r border-[#333333]">
                              {TIME_SLOTS.map((hour) => (
                                <div
                                  key={hour}
                                  className="h-16 p-2 text-xs text-white/50 flex items-start justify-end"
                                >
                                  {hour === 12 ? "12 PM" : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}
                                </div>
                              ))}
                            </div>
                            
                            {/* Day columns */}
                            {getDaysOfWeek().map((day, dayIndex) => (
                              <div key={dayIndex} className="border-r border-[#333333]">
                                {TIME_SLOTS.map((hour, hourIndex) => {
                                  const dayName = format(day, 'EEEE').toLowerCase();
                                  const formattedHour = hour.toString().padStart(2, '0');
                                  
                                  // Find any time blocks that match this slot
                                  const matchingBlocks = timeBlocks.filter(block => {
                                    if (!block.enabled) return false;
                                    if (block.isIdealWeek !== (viewMode === 'idealWeek')) return false;
                                    
                                    if (block.day !== dayName) return false;
                                    
                                    const blockStartHour = parseInt(block.startTime.split(':')[0]);
                                    const blockEndHour = parseInt(block.endTime.split(':')[0]);
                                    
                                    return hour >= blockStartHour && hour < blockEndHour;
                                  });
                                  
                                  const hasBlock = matchingBlocks.length > 0;
                                  const block = hasBlock ? matchingBlocks[0] : null;
                                  
                                  // Check if this is the start hour of the block
                                  const isBlockStart = block && parseInt(block.startTime.split(':')[0]) === hour;
                                  // Check if this is the end hour of the block
                                  const isBlockEnd = block && parseInt(block.endTime.split(':')[0]) === hour + 1;
                                  
                                  return (
                                    <div
                                      key={hour}
                                      className={`h-16 border-b border-[#333333] relative hover:bg-white/5 cursor-pointer`}
                                      onMouseDown={() => {
                                        if (!hasBlock) {
                                          startTimeBlockCreation(dayIndex, hourIndex);
                                        }
                                      }}
                                      style={{
                                        backgroundColor: hasBlock ? `${block?.color}20` : 'transparent',
                                      }}
                                    >
                                      {hasBlock && isBlockStart && (
                                        <>
                                          <div 
                                            className="absolute top-0 right-0 left-0 h-2 cursor-ns-resize"
                                            onMouseDown={(e) => startResizeTimeBlock(block!, 'top', e)}
                                          />
                                          <div
                                            className="absolute inset-0 flex flex-col p-1 overflow-hidden"
                                            style={{ 
                                              borderLeft: `3px solid ${block?.color}`
                                            }}
                                          >
                                            <div className="text-xs font-semibold truncate text-white">
                                              {block?.label || 'Untitled'}
                                            </div>
                                            <div className="text-xs opacity-70">
                                              {block?.startTime} - {block?.endTime}
                                            </div>
                                          </div>
                                        </>
                                      )}
                                      
                                      {hasBlock && isBlockEnd && (
                                        <div 
                                          className="absolute bottom-0 right-0 left-0 h-2 cursor-ns-resize"
                                          onMouseDown={(e) => startResizeTimeBlock(block!, 'bottom', e)}
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
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