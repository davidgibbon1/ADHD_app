'use client';

import { useState, useEffect, useRef } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks, subWeeks, addDays } from 'date-fns';
import { getOrCreateUserId } from '@/lib/localStorage/storageUtils';
import { Button } from '@/components/ui/button';
import { Clock, AlertCircle, Calendar as CalendarIcon, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

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
  databaseId?: string;
}

interface DraggingState {
  active: boolean;
  startX: number;
  startY: number;
  dayIndex: number;
  hourIndex: number;
  timeBlock?: TimeBlock;
  isResizing: boolean;
  isMoving?: boolean;
  resizeEdge?: 'top' | 'bottom';
  originalDay?: string;
  originalStart?: string;
  originalEnd?: string;
}

interface IdealWeekProps {
  userId: string;
  onHasUnsavedChanges: (hasChanges: boolean) => void;
}

interface DatabaseInfo {
  id: string;
  name: string;
  color: string;
}

export default function IdealWeek({ userId, onHasUnsavedChanges }: IdealWeekProps) {
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [originalTimeBlocks, setOriginalTimeBlocks] = useState<TimeBlock[]>([]);
  const [selectedColor, setSelectedColor] = useState<string>(COLORS[0].color);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [blockLabel, setBlockLabel] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(null);
  const [historyStack, setHistoryStack] = useState<TimeBlock[][]>([]);
  const calendarRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
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
    if (userId) {
      loadTimeBlocks();
    }
  }, [userId]);

  // Load available databases and their colors
  useEffect(() => {
    if (userId) {
      fetchDatabases();
    }
  }, [userId]);

  // Add to history stack whenever timeBlocks change
  useEffect(() => {
    if (timeBlocks.length > 0 && JSON.stringify(timeBlocks) !== JSON.stringify(historyStack[historyStack.length - 1])) {
      setHistoryStack(prev => [...prev.slice(-9), JSON.parse(JSON.stringify(timeBlocks))]);
    }
  }, [timeBlocks]);

  // Function to fetch databases
  const fetchDatabases = async () => {
    try {
      const response = await fetch(`/api/notion-databases?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        const activeDBs = data.filter((db: any) => db.isActive);
        
        // Map to simplified structure
        const dbInfos = activeDBs.map((db: any) => ({
          id: db.id,
          name: db.name,
          color: db.color || COLORS[0].color
        }));
        
        setDatabases(dbInfos);
        
        // Set first database as selected if none is selected
        if (dbInfos.length > 0 && !selectedDatabaseId) {
          setSelectedDatabaseId(dbInfos[0].id);
          // If there's a color, set it as selected
          if (dbInfos[0].color) {
            setSelectedColor(dbInfos[0].color);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching databases:', err);
    }
  };

  // Update selected color when database changes
  useEffect(() => {
    if (selectedDatabaseId) {
      const selectedDB = databases.find(db => db.id === selectedDatabaseId);
      if (selectedDB && selectedDB.color) {
        setSelectedColor(selectedDB.color);
      }
    }
  }, [selectedDatabaseId, databases]);

  // Check for unsaved changes
  useEffect(() => {
    // Simple way to compare: different length means changes
    if (originalTimeBlocks.length !== timeBlocks.length) {
      setHasUnsavedChanges(true);
      onHasUnsavedChanges(true);
      return;
    }

    // Compare each block
    const hasChanges = !originalTimeBlocks.every(origBlock => {
      const matchingBlock = timeBlocks.find(block => block.id === origBlock.id);
      if (!matchingBlock) return false;
      
      // Compare relevant properties
      return (
        matchingBlock.day === origBlock.day &&
        matchingBlock.startTime === origBlock.startTime &&
        matchingBlock.endTime === origBlock.endTime &&
        matchingBlock.enabled === origBlock.enabled &&
        matchingBlock.color === origBlock.color &&
        matchingBlock.label === origBlock.label
      );
    });

    setHasUnsavedChanges(hasChanges);
    onHasUnsavedChanges(hasChanges);
  }, [timeBlocks, originalTimeBlocks, onHasUnsavedChanges]);

  // Handle beforeunload event
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; // This is required for browsers to show the dialog
        return ''; // This is the message that will be shown in some browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

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
        const hourIndex = Math.min(Math.max(Math.floor(mouseY / gridHeight), 0), TIME_SLOTS.length - 1);
        const hour = TIME_SLOTS[hourIndex];
        
        if (dragging.isResizing && dragging.timeBlock) {
          // Handle resizing
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
        } else if (dragging.isMoving && dragging.timeBlock) {
          // Handle moving an existing block
          const dayOfWeek = getDaysOfWeek()[dayIndex];
          const newDay = format(dayOfWeek, 'EEEE').toLowerCase();
          
          // Calculate the duration in hours
          const startHour = parseInt(dragging.originalStart?.split(':')[0] || '0');
          const endHour = parseInt(dragging.originalEnd?.split(':')[0] || '0');
          const duration = endHour - startHour;
          
          // New start and end times
          const newStartHour = hour;
          const newEndHour = hour + duration;
          
          // Update block position
          setTimeBlocks(blocks => blocks.map(block => 
            block.id === dragging.timeBlock?.id
              ? { 
                  ...block, 
                  day: newDay,
                  startTime: `${newStartHour.toString().padStart(2, '0')}:00`,
                  endTime: `${newEndHour.toString().padStart(2, '0')}:00`
                }
              : block
          ));
        } else {
          // Handle dragging/creating
          const startDayIndex = dragging.dayIndex;
          const startHour = TIME_SLOTS[dragging.hourIndex];
          const currentHour = TIME_SLOTS[hourIndex];
          
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
      
      // Fetch time blocks from the database
      const response = await fetch(`/api/time-blocks?userId=${userId}&isIdealWeek=true`);
      
      if (response.ok) {
        const data = await response.json();
        setTimeBlocks(data || []);
        setOriginalTimeBlocks(JSON.parse(JSON.stringify(data || [])));
        setHasUnsavedChanges(false);
        onHasUnsavedChanges(false);
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

  // Handle keyboard events for the entire component
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete key handling
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockId && !editingBlockId) {
        // Only handle delete if not in an input field
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return;
        }
        removeTimeBlock(selectedBlockId);
        setSelectedBlockId(null);
      }
      
      // Undo functionality (Command+Z on Mac)
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !editingBlockId) {
        // Don't trigger undo when editing text in inputs
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return;
        }
        
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedBlockId, editingBlockId, historyStack]);

  // Function to handle undo operation
  const handleUndo = () => {
    if (historyStack.length > 1) {
      // Get the previous state (second to last item in history)
      const previousState = historyStack[historyStack.length - 2];
      
      // Update timeBlocks to the previous state
      setTimeBlocks(previousState);
      
      // Remove the current state from history
      setHistoryStack(prev => prev.slice(0, -1));
      
      console.log('Undo operation performed');
    } else {
      console.log('Nothing to undo');
    }
  };

  // Start creating a new time block
  const startTimeBlockCreation = (dayIndex: number, hourIndex: number) => {
    const dayOfWeek = getDaysOfWeek()[dayIndex];
    const dayName = format(dayOfWeek, 'EEEE').toLowerCase();
    const hour = TIME_SLOTS[hourIndex];
    
    // Find the database color if one is selected
    let blockColor = selectedColor;
    let selectedDb = null;
    if (selectedDatabaseId) {
      selectedDb = databases.find(db => db.id === selectedDatabaseId);
      if (selectedDb && selectedDb.color) {
        blockColor = selectedDb.color;
      }
    }
    
    // Create a new time block
    const newTimeBlock: TimeBlock = {
      id: `tb-${Date.now()}`,
      day: dayName,
      startTime: `${hour.toString().padStart(2, '0')}:00`,
      endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
      enabled: true,
      color: blockColor,
      label: blockLabel || (selectedDb ? selectedDb.name : 'Untitled'),
      isIdealWeek: true,
      databaseId: selectedDatabaseId || undefined
    };
    
    // Add it to the list
    setTimeBlocks(prev => [...prev, newTimeBlock]);
    
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

  // Start moving a time block
  const startMoveTimeBlock = (e: React.MouseEvent, timeBlock: TimeBlock) => {
    e.stopPropagation();
    
    if (editingBlockId) return; // Don't start moving if we're editing
    
    const dayIndex = getDaysOfWeek().findIndex(day => 
      format(day, 'EEEE').toLowerCase() === timeBlock.day
    );
    
    // Calculate the hour index from the start time
    const startHour = parseInt(timeBlock.startTime.split(':')[0]);
    const hourIndex = TIME_SLOTS.indexOf(startHour);
    
    setDragging({
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      dayIndex,
      hourIndex,
      timeBlock,
      isResizing: false,
      isMoving: true,
      originalDay: timeBlock.day,
      originalStart: timeBlock.startTime,
      originalEnd: timeBlock.endTime
    });
    
    // Set the block as selected
    setSelectedBlockId(timeBlock.id);
  };

  const removeTimeBlock = (id: string) => {
    setTimeBlocks(prev => prev.filter(block => block.id !== id));
  };

  // Get days of the current week (generic week for ideal week template)
  const getDaysOfWeek = () => {
    // For ideal week, create a generic week starting from Monday
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  };
  
  // Format day name
  const formatDayHeader = (date: Date) => {
    return format(date, 'EEE');
  };

  // Start editing a time block label
  const startEditingLabel = (e: React.MouseEvent, block: TimeBlock) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Starting edit for block:', block.id);
    setEditingBlockId(block.id);
    setEditingLabel(block.label || 'Untitled');
    setSelectedBlockId(block.id);
    
    // Focus the input field after render with a delay to ensure the DOM is updated
    setTimeout(() => {
      if (editInputRef.current) {
        console.log('Focusing input field');
        editInputRef.current.focus();
        editInputRef.current.select();
      } else {
        console.log('Input ref not found');
      }
    }, 50);
  };

  // Save edited label
  const saveEditedLabel = () => {
    if (editingBlockId) {
      console.log('Saving edited label:', editingLabel);
      setTimeBlocks(blocks => 
        blocks.map(block => 
          block.id === editingBlockId
            ? { ...block, label: editingLabel || 'Untitled' }
            : block
        )
      );
      setEditingBlockId(null);
    }
  };

  // Handle key press when editing or when a block is selected
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEditedLabel();
    } else if (e.key === 'Escape') {
      setEditingBlockId(null);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockId && !editingBlockId) {
      // Delete the selected block if not currently editing
      removeTimeBlock(selectedBlockId);
      setSelectedBlockId(null);
    }
  };

  // Select a time block
  const selectTimeBlock = (e: React.MouseEvent, block: TimeBlock) => {
    e.stopPropagation();
    setSelectedBlockId(block.id);
  };

  // Save all time blocks
  const handleSave = async () => {
    try {
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
            isIdealWeek: true
          }))
        }),
      });

      if (saveResponse.ok) {
        setSaveMessage('Ideal week schedule saved successfully!');
        setTimeout(() => setSaveMessage(''), 3000);
        setOriginalTimeBlocks(JSON.parse(JSON.stringify(timeBlocks)));
        setHasUnsavedChanges(false);
        onHasUnsavedChanges(false);
      } else {
        throw new Error('Failed to save ideal week schedule');
      }
    } catch (err) {
      console.error('Error saving ideal week schedule:', err);
      setError('Failed to save ideal week schedule');
      setTimeout(() => setError(''), 3000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-white">Ideal Week Template</h2>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <div className="text-yellow-400 text-sm mr-2">
              You have unsaved changes
            </div>
          )}
          <Button
            onClick={handleSave}
            className={`${hasUnsavedChanges ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-purple-600 hover:bg-purple-700'} text-white`}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Ideal Week
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

      <p className="text-white/70">
        Design your ideal week schedule as a template for recurring activities and habits.
        Click and drag on the calendar to create time blocks for specific activities.
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
                    Database
                  </label>
                  <select
                    value={selectedDatabaseId || ''}
                    onChange={(e) => setSelectedDatabaseId(e.target.value || null)}
                    className="w-full bg-[#252525] border border-[#333333] rounded-md p-2 text-white"
                  >
                    <option value="">None</option>
                    {databases.map(db => (
                      <option key={db.id} value={db.id}>
                        {db.name}
                      </option>
                    ))}
                  </select>
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
                
                {/* Database color legend */}
                {databases.length > 0 && (
                  <div className="mt-4">
                    <h3 className="font-medium text-white mb-2">Database Colors</h3>
                    <div className="space-y-2">
                      {databases.map(db => (
                        <div 
                          key={db.id} 
                          className="flex items-center p-2 rounded-md bg-[#252525]"
                          onClick={() => {
                            setSelectedDatabaseId(db.id);
                            setSelectedColor(db.color || '#888888');
                          }}
                          style={{ 
                            borderLeft: `4px solid ${db.color || '#888888'}`,
                            cursor: 'pointer',
                            backgroundColor: selectedDatabaseId === db.id ? '#333333' : '#252525'
                          }}
                        >
                          <div 
                            className="w-4 h-4 rounded-full mr-2" 
                            style={{ backgroundColor: db.color || '#888888' }}
                          ></div>
                          <span className="text-sm text-white">{db.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="mt-4">
                  <h3 className="font-medium text-white mb-2">Your Time Blocks</h3>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {timeBlocks.length > 0 ? (
                      timeBlocks.map(block => (
                        <div 
                          key={block.id} 
                          className={`flex items-center justify-between bg-[#252525] border border-[#333333] rounded-md p-3 ${selectedBlockId === block.id ? 'bg-white/10' : ''}`}
                          style={{ 
                            borderLeft: `4px solid ${block.color || '#CCCCCC'}` 
                          }}
                          onClick={(e) => selectTimeBlock(e, block)}
                          onDoubleClick={(e) => startEditingLabel(e, block)}
                          tabIndex={0}
                          onKeyDown={handleEditKeyDown}
                        >
                          <div className="flex-1 min-w-0">
                            {editingBlockId === block.id ? (
                              <input
                                ref={editInputRef}
                                type="text"
                                value={editingLabel}
                                onChange={(e) => setEditingLabel(e.target.value)}
                                onBlur={saveEditedLabel}
                                onKeyDown={handleEditKeyDown}
                                className="w-full font-medium bg-[#333333] border border-[#444444] rounded px-2 py-1 text-white mb-1 relative z-50"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                style={{position: 'relative', zIndex: 100}}
                              />
                            ) : (
                              <div 
                                className="font-medium text-white capitalize cursor-text"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditingLabel(e, block);
                                }}
                                onDoubleClick={(e) => startEditingLabel(e, block)}
                              >
                                {block?.label || 'Untitled'}
                              </div>
                            )}
                            <div className="text-sm text-white/70 capitalize">
                              {block.day}
                            </div>
                            <div className="text-xs text-white/50">
                              {block.startTime} - {block.endTime}
                            </div>
                            {block.databaseId && (
                              <div className="text-xs text-white/90 mt-1 italic">
                                {databases.find(db => db.id === block.databaseId)?.name || ''}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-950/20"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTimeBlock(block.id);
                            }}
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
              <CardTitle className="flex items-center">
                <CalendarIcon className="h-5 w-5 mr-2" />
                Ideal Week Template
              </CardTitle>
              <CardDescription className="text-white/70">
                Click and drag to create time blocks for your ideal week template
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
                      className="p-2 text-center text-white"
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
                                  className="absolute top-0 right-0 left-0 h-2 cursor-ns-resize resize-handle resize-handle-top"
                                  onMouseDown={(e) => startResizeTimeBlock(block!, 'top', e)}
                                />
                                <div
                                  className={`absolute inset-0 flex flex-col p-1 overflow-hidden time-block ${selectedBlockId === block?.id ? 'bg-white/30' : ''} ${dragging.isMoving && dragging.timeBlock?.id === block.id ? 'time-block-dragging' : ''}`}
                                  style={{ 
                                    borderLeft: `3px solid ${block?.color}`
                                  }}
                                  onClick={(e) => selectTimeBlock(e, block!)}
                                  onDoubleClick={(e) => startEditingLabel(e, block!)}
                                  onMouseDown={(e) => startMoveTimeBlock(e, block!)}
                                  tabIndex={0}
                                  onKeyDown={handleEditKeyDown}
                                >
                                  {editingBlockId === block?.id ? (
                                    <input
                                      ref={editInputRef}
                                      type="text"
                                      value={editingLabel}
                                      onChange={(e) => setEditingLabel(e.target.value)}
                                      onBlur={saveEditedLabel}
                                      onKeyDown={handleEditKeyDown}
                                      className="text-xs w-full font-semibold bg-white/20 border border-white/30 rounded px-1 text-white relative z-50"
                                      autoFocus
                                      onClick={(e) => e.stopPropagation()}
                                      style={{position: 'relative', zIndex: 100}}
                                    />
                                  ) : (
                                    <div 
                                      className="text-xs font-semibold truncate text-white cursor-text"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startEditingLabel(e, block!);
                                      }}
                                      onDoubleClick={(e) => startEditingLabel(e, block!)}
                                    >
                                      {block?.label || 'Untitled'}
                                    </div>
                                  )}
                                  <div className="text-xs opacity-70">
                                    {block?.startTime} - {block?.endTime}
                                  </div>
                                  {block.databaseId && (
                                    <div className="text-xs opacity-90 mt-1 italic">
                                      {databases.find(db => db.id === block.databaseId)?.name || ''}
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                            
                            {hasBlock && isBlockEnd && (
                              <div 
                                className="absolute bottom-0 right-0 left-0 h-2 cursor-ns-resize resize-handle resize-handle-bottom"
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

      <style jsx global>{`
        .time-block {
          transition: box-shadow 0.1s ease-in-out;
        }
        .time-block:hover {
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
          cursor: move;
        }
        .time-block-dragging {
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
          opacity: 0.8;
        }
        .resize-handle {
          height: 6px;
          cursor: ns-resize;
          position: absolute;
          left: 0;
          right: 0;
        }
        .resize-handle-top {
          top: 0;
        }
        .resize-handle-bottom {
          bottom: 0;
        }
      `}</style>
    </div>
  );
} 