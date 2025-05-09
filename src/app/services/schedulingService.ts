import { ExtendedTask } from '@/lib/db/sqliteService';
import { NotionDatabase } from '@/lib/db/notionDatabaseService';
import { fetchTasksFromDatabase } from './notionService';
import { CalendarEvent } from '@/lib/googleCalendar';
import { addDays, format, isAfter, isBefore, isSameDay, parseISO, setHours, setMinutes } from 'date-fns';
import { getDatabase } from '@/lib/db/sqliteService';
import { getBaseUrl } from '@/lib/utils';

// Interface for Notion tasks from notionService
interface NotionTask {
  id: string;
  title: string;
  status: string;
  dueDate?: string;
  databaseId: string;
  databaseName: string;
}

// Interface for scheduling rules
export interface SchedulingRules {
  maxTaskDuration: number;
  maxLongTaskDuration: number;
  longTaskThreshold: number;
  priorityWeight: number;
  timeWeight: number;
  randomnessFactor: number;
  workingDays: {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  };
  timeBlocks: Array<{
    id: string;
    day: string;
    startTime: string;
    endTime: string;
    enabled: boolean;
    databaseId?: string;
  }>;
}

// Interface for a task with scheduling metadata
interface SchedulableTask {
  id: string;
  title: string;
  completed: boolean;
  userId: string;
  createdAt: number;
  updatedAt: number;
  notionId?: string;
  source?: string;
  estimatedDuration: number; // in minutes
  score?: number;
  notionDatabaseId?: string;
  notionDatabaseName?: string;
  metadata?: {
    duration?: number;
    priority?: 'high' | 'medium' | 'low';
    energy?: 'low' | 'medium' | 'high';
    tags?: string[];
    dueDate?: string;
    category?: string;
    notes?: string;
    [key: string]: any;
  };
}

// Interface for a time slot
interface TimeSlot {
  day: Date;
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  durationMinutes: number;
  databaseId?: string;
}

// Define our own TaskRow interface since it's not exported from sqliteService
interface TaskRow {
  id: string;
  title: string;
  completed: number;  // 0 or 1 in DB
  userId?: string;
  createdAt?: number;
  updatedAt?: number;
  notionId?: string;
  notionDatabaseId?: string;
  source?: string;
  database_id?: string;
  
  // Fields from task_metadata (joined)
  duration?: number;
  priority?: 'low' | 'medium' | 'high' | null;
  energy?: 'low' | 'medium' | 'high' | null;
  dueDate?: string | null;
  category?: string | null;
  notes?: string | null;
}

// Get default scheduling rules
export function getDefaultRules(): SchedulingRules {
  return {
    maxTaskDuration: 60,
    maxLongTaskDuration: 120,
    longTaskThreshold: 120,
    priorityWeight: 0.7,
    timeWeight: 0.3,
    randomnessFactor: 0.2,
    workingDays: {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
    },
    timeBlocks: [
      { id: '1', day: 'weekday', startTime: '09:00', endTime: '17:00', enabled: true, databaseId: '' },
    ]
  };
}

// Get all database IDs associated with time blocks in the scheduling rules
function getTimeBlockDatabaseIds(rules: SchedulingRules): string[] {
  const databaseIdSet = new Set<string>();
  
  rules.timeBlocks
    .filter(block => block.enabled && block.databaseId && block.databaseId.trim() !== '')
    .forEach(block => {
      if (block.databaseId) {
        databaseIdSet.add(block.databaseId);
      }
    });
  
  // Convert Set to Array for compatibility
  return Array.from(databaseIdSet);
}

// Fetch tasks from Notion database and prepare them for scheduling
export async function fetchTasksForScheduling(
  database: NotionDatabase,
  existingEvents: CalendarEvent[],
  rules: SchedulingRules
): Promise<SchedulableTask[]> {
  const baseUrl = getBaseUrl();
  
  try {
    console.log(`🔍 SCHEDULING: Fetching tasks for ${database.name} (ID: ${database.id})`);
    
    // Use the same task fetching approach as the Notion sync page
    // First, get all tasks for this user directly from the database
    const db = getDatabase();
    
    // Special handling for ideal-week and this-week sources
    if (database.id === 'ideal-week' || database.id === 'this-week') {
      console.log(`🔍 SCHEDULING: Special handling for ${database.id} source`);
      
      // Get all database IDs associated with time blocks
      const databaseIds = getTimeBlockDatabaseIds(rules);
      console.log(`🔍 SCHEDULING: Found ${databaseIds.length} database IDs in time blocks:`, databaseIds);
      
      if (databaseIds.length === 0) {
        console.log(`🔍 SCHEDULING: No database IDs found in time blocks. Will fetch all incomplete tasks.`);
        
        // If no database IDs found in time blocks, fetch all incomplete tasks
        const allTasksQuery = `
          SELECT 
            t.*,
            m.duration, m.priority, m.energy, m.dueDate, m.category, m.notes
          FROM tasks t
          LEFT JOIN task_metadata m ON t.id = m.taskId
          WHERE t.completed = 0 AND t.userId = ?
          LIMIT 100
        `;
        
        const allTaskRows = db.prepare(allTasksQuery).all(database.userId) as TaskRow[];
        console.log(`🔍 SCHEDULING: Found ${allTaskRows.length} incomplete tasks for all databases`);
        
        return convertTaskRowsToSchedulable(allTaskRows, database);
      }
      
      // Prepare query to fetch tasks from all databases associated with time blocks
      const placeholders = databaseIds.map(() => '?').join(',');
      const dbTasksQuery = `
        SELECT 
          t.*,
          m.duration, m.priority, m.energy, m.dueDate, m.category, m.notes
        FROM tasks t
        LEFT JOIN task_metadata m ON t.id = m.taskId
        WHERE t.completed = 0
          AND t.userId = ?
          AND (
            t.notionDatabaseId IN (${placeholders})
            OR t.database_id IN (${placeholders})
            OR t.source IN (${placeholders})
          )
      `;
      
      // Prepare parameters: userId followed by databaseIds three times
      const params = [
        database.userId,
        ...databaseIds,
        ...databaseIds,
        ...databaseIds
      ];
      
      const dbTaskRows = db.prepare(dbTasksQuery).all(...params) as TaskRow[];
      console.log(`🔍 SCHEDULING: Found ${dbTaskRows.length} tasks associated with database IDs in time blocks`);
      
      // If no tasks found with specific database match, try a broader search
      if (dbTaskRows.length === 0) {
        console.log(`🔍 SCHEDULING: No tasks found with specific database match. Trying broader search...`);
        
        // Get all incomplete tasks for this user
        const broadQuery = `
          SELECT 
            t.*,
            m.duration, m.priority, m.energy, m.dueDate, m.category, m.notes
          FROM tasks t
          LEFT JOIN task_metadata m ON t.id = m.taskId
          WHERE t.completed = 0 AND t.userId = ?
          LIMIT 50
        `;
        
        const broadTaskRows = db.prepare(broadQuery).all(database.userId) as TaskRow[];
        console.log(`🔍 SCHEDULING: Found ${broadTaskRows.length} tasks with broader search`);
        
        if (broadTaskRows.length > 0) {
          return convertTaskRowsToSchedulable(broadTaskRows, database);
        }
      }
      
      // Convert database task rows to schedulable tasks
      return convertTaskRowsToSchedulable(dbTaskRows, database);
    }
    
    // Standard approach for normal databases (not ideal-week or this-week)
    console.log(`🔍 SCHEDULING: Standard handling for database ${database.name} (ID: ${database.id})`);
    
    // Log total tasks to diagnose the issue
    const allTasksStmt = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE completed = 0');
    const { count: totalTasks } = allTasksStmt.get() as { count: number };
    console.log(`🔍 SCHEDULING: Total incomplete tasks in database: ${totalTasks}`);
    
    // Get all tasks with their metadata in a single query
    const query = `
      SELECT 
        t.*,
        m.duration, m.priority, m.energy, m.dueDate, m.category, m.notes
      FROM tasks t
      LEFT JOIN task_metadata m ON t.id = m.taskId
      WHERE t.completed = 0
        AND (
          t.userId = ? 
          AND (
            t.notionDatabaseId = ?
            OR t.database_id = ? 
            OR t.source = ?
          )
        )
    `;
    
    // Execute the query with the database identifiers
    const taskRows = db.prepare(query).all(
      database.userId,
      database.notionDatabaseId,
      database.id,
      database.id
    ) as TaskRow[];
    
    console.log(`🔍 SCHEDULING: Found ${taskRows.length} tasks for database ${database.name}`);
    
    // If no tasks found with exact database match, try a broader search
    if (taskRows.length === 0 && totalTasks > 0) {
      console.log(`🔍 SCHEDULING: No tasks found with specific database match. Trying broader search...`);
      
      // Look for any tasks that might be related to this database or have no specific database ID
      const broadQuery = `
        SELECT 
          t.*,
          m.duration, m.priority, m.energy, m.dueDate, m.category, m.notes
        FROM tasks t
        LEFT JOIN task_metadata m ON t.id = m.taskId
        WHERE t.completed = 0
          AND t.userId = ?
          AND (
            t.database_id = ?
            OR t.notionDatabaseId = ?
            OR t.notionDatabaseId IS NULL
            OR t.notionDatabaseId = ''
            OR t.source = ?
          )
        LIMIT 50
      `;
      
      // Execute the broader query
      const broadTaskRows = db.prepare(broadQuery).all(
        database.userId,
        database.id,
        database.notionDatabaseId || '',
        database.id
      ) as TaskRow[];
      
      console.log(`🔍 SCHEDULING: Found ${broadTaskRows.length} tasks with broader search`);
      
      // Replace the empty task list with the broader results
      if (broadTaskRows.length > 0) {
        return convertTaskRowsToSchedulable(broadTaskRows, database);
      }
    }
    
    // Get tags for tasks and convert to schedulable format
    return convertTaskRowsToSchedulable(taskRows, database);
  } catch (error) {
    console.error('🔍 SCHEDULING: Error fetching tasks for scheduling:', error);
    throw error;
  }
}

// Helper function to convert task rows to schedulable tasks and track their database associations
function convertTaskRowsToSchedulable(
  taskRows: TaskRow[],
  database: NotionDatabase
): SchedulableTask[] {
  const schedulableTasks = taskRows.map(row => {
    // Determine the database ID for this task
    const taskDatabaseId = row.notionDatabaseId || row.database_id || row.source || database.id;
    
    // Convert task to schedulable format
    return {
      id: row.id,
      title: row.title,
      completed: Boolean(row.completed),
      userId: row.userId || database.userId,
      createdAt: row.createdAt || Date.now(),
      updatedAt: row.updatedAt || Date.now(),
      notionId: row.notionId,
      notionDatabaseId: taskDatabaseId,
      source: row.source || 'local',
      estimatedDuration: row.duration || 30, // Default to 30 minutes if not specified
      notionDatabaseName: database.name,
      metadata: {
        duration: row.duration,
        priority: row.priority as 'high' | 'medium' | 'low' | undefined,
        energy: row.energy as 'high' | 'medium' | 'low' | undefined,
        dueDate: row.dueDate || undefined,
        category: row.category || undefined,
        notes: row.notes || undefined
      }
    };
  });

  console.log(`🔍 SCHEDULING: Converted ${schedulableTasks.length} tasks to schedulable format`);
  
  // Log database associations for debugging
  const databaseCounts: Record<string, number> = {};
  schedulableTasks.forEach(task => {
    const dbId = task.notionDatabaseId || 'unknown';
    databaseCounts[dbId] = (databaseCounts[dbId] || 0) + 1;
  });
  
  console.log(`🔍 SCHEDULING: Task database distribution:`, databaseCounts);
  
  return schedulableTasks;
}

// Calculate task score based on priority and estimated time
function calculateTaskScore(
  task: SchedulableTask, 
  rules: SchedulingRules
): number {
  // Convert priority to numeric value (1 = high, 3 = low)
  const priorityValue = task.metadata?.priority === 'high' ? 1 :
                        task.metadata?.priority === 'medium' ? 2 : 3;
  
  // Calculate base score
  // Higher priority (lower number) and longer tasks get higher scores
  const priorityScore = 1 / priorityValue;
  const timeScore = 1 / (task.estimatedDuration || 30); // Avoid division by zero
  
  const baseScore = (rules.priorityWeight * priorityScore) + (rules.timeWeight * timeScore);
  
  // Add controlled randomness
  const randomness = Math.random() * rules.randomnessFactor * 2 - rules.randomnessFactor;
  
  return baseScore + randomness;
}

// Check if a day is a working day according to rules
function isWorkingDay(date: Date, rules: SchedulingRules): boolean {
  const dayOfWeek = format(date, 'EEEE').toLowerCase();
  return rules.workingDays[dayOfWeek as keyof typeof rules.workingDays] || false;
}

// Get available time blocks for a specific day
function getTimeBlocksForDay(date: Date, rules: SchedulingRules): Array<{startTime: string, endTime: string}> {
  const dayOfWeek = format(date, 'EEEE').toLowerCase();
  const dayType = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(dayOfWeek) 
    ? 'weekday' 
    : 'weekend';
  
  return rules.timeBlocks
    .filter(block => block.enabled)
    .filter(block => 
      block.day === 'all' || 
      block.day === dayType || 
      block.day === dayOfWeek
    )
    .map(block => ({
      startTime: block.startTime,
      endTime: block.endTime
    }));
}

// Generate time slots for scheduling
function generateTimeSlots(
  startDate: Date, 
  endDate: Date, 
  rules: SchedulingRules,
  existingEvents: CalendarEvent[]
): TimeSlot[] {
  try {
    console.log(`🔍 SCHEDULING: Generating time slots from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    const slots: TimeSlot[] = [];
    
    // Create a copy of start date to avoid modifying the original
    const currentDate = new Date(startDate);
    
    // Ensure we have default rules if not provided
    if (!rules || !rules.workingDays || !rules.timeBlocks) {
      console.log("🔍 SCHEDULING: Using default working days and time blocks as rules are incomplete");
      rules = getDefaultRules();
    }
    
    // Ensure working days are properly set
    const workingDays = rules.workingDays || {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false
    };
    
    console.log(`🔍 SCHEDULING: Working days configuration:`, JSON.stringify(workingDays));
    
    // Loop through each day in the date range
    while (currentDate <= endDate) {
      const dayName = format(currentDate, 'EEEE').toLowerCase() as keyof typeof workingDays;
      console.log(`🔍 SCHEDULING: Checking day ${format(currentDate, 'yyyy-MM-dd')} (${dayName})`);
      
      // Check if this is a working day
      if (workingDays[dayName]) {
        console.log(`🔍 SCHEDULING: ${dayName} is a working day`);
        
        // Get time blocks for this day of the week
        const dayBlocks = rules.timeBlocks
          .filter(block => {
            const blockDay = block.day.toLowerCase();
            return (
              block.enabled && 
              (blockDay === dayName || blockDay === 'all' || 
              (blockDay === 'weekday' && ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(dayName)) ||
              (blockDay === 'weekend' && ['saturday', 'sunday'].includes(dayName)))
            );
          })
          .map(block => ({
            startTime: block.startTime,
            endTime: block.endTime,
            databaseId: block.databaseId
          }));
        
        console.log(`🔍 SCHEDULING: Found ${dayBlocks.length} time blocks for ${dayName}`);
        
        // If no specific blocks are defined for this day, use default
        if (dayBlocks.length === 0) {
          console.log(`🔍 SCHEDULING: No time blocks defined for ${dayName}, using default 9 AM - 5 PM`);
          dayBlocks.push({
            startTime: '09:00',
            endTime: '17:00',
            databaseId: undefined
          });
        }
        
        // Add each time block to slots, handling existing events
        for (const block of dayBlocks) {
          try {
            // Validate time format
            if (!block.startTime.match(/^\d{1,2}:\d{2}$/) || !block.endTime.match(/^\d{1,2}:\d{2}$/)) {
              console.error(`🔍 SCHEDULING: Invalid time format for block: ${JSON.stringify(block)}`);
              continue;
            }
            
            const [startHour, startMinute] = block.startTime.split(':').map(Number);
            const [endHour, endMinute] = block.endTime.split(':').map(Number);
            
            // Validate hours and minutes
            if (
              isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute) ||
              startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23 ||
              startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59
            ) {
              console.error(`🔍 SCHEDULING: Invalid hours/minutes in block: ${JSON.stringify(block)}`);
              continue;
            }
            
            // Make sure end time is after start time
            if (startHour > endHour || (startHour === endHour && startMinute >= endMinute)) {
              console.error(`🔍 SCHEDULING: End time must be after start time in block: ${JSON.stringify(block)}`);
              continue;
            }
            
            // Convert block times to Date objects for this day
            const blockStart = new Date(currentDate);
            blockStart.setHours(startHour, startMinute, 0, 0);
            
            const blockEnd = new Date(currentDate);
            blockEnd.setHours(endHour, endMinute, 0, 0);
            
            // Find events that overlap with this time block
            const overlappingEvents = existingEvents.filter(event => {
              if (!event.start?.dateTime || !event.end?.dateTime) return false;
              
              try {
                const eventStart = parseISO(event.start.dateTime);
                const eventEnd = parseISO(event.end.dateTime);
                
                // Check if event is on the same day as block
                if (!isSameDay(eventStart, currentDate)) return false;
                
                // Check if event overlaps with block
                return (
                  (eventStart < blockEnd && eventEnd > blockStart)
                );
              } catch (e) {
                console.error(`🔍 SCHEDULING: Error parsing event dates:`, e);
                return false;
              }
            });
            
            if (overlappingEvents.length === 0) {
              // No conflicts, add the entire block
              const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
              
              slots.push({
                day: new Date(currentDate),
                startTime: block.startTime,
                endTime: block.endTime,
                durationMinutes,
                databaseId: block.databaseId
              });
            } else {
              // Sort overlapping events by start time
              overlappingEvents.sort((a, b) => {
                return parseISO(a.start!.dateTime).getTime() - parseISO(b.start!.dateTime).getTime();
              });
              
              // Break the block into smaller non-overlapping slots
              let currentStart = blockStart;
              
              for (const event of overlappingEvents) {
                const eventStart = parseISO(event.start!.dateTime);
                const eventEnd = parseISO(event.end!.dateTime);
                
                // If there's space before this event, add it as a slot
                if (eventStart > currentStart) {
                  const slotStartHour = currentStart.getHours();
                  const slotStartMinute = currentStart.getMinutes();
                  const slotEndHour = eventStart.getHours();
                  const slotEndMinute = eventStart.getMinutes();
                  
                  const slotDurationMinutes = 
                    (slotEndHour * 60 + slotEndMinute) - (slotStartHour * 60 + slotStartMinute);
                  
                  if (slotDurationMinutes >= 15) { // Only add if at least 15 minutes
                    slots.push({
                      day: new Date(currentDate),
                      startTime: `${slotStartHour.toString().padStart(2, '0')}:${slotStartMinute.toString().padStart(2, '0')}`,
                      endTime: `${slotEndHour.toString().padStart(2, '0')}:${slotEndMinute.toString().padStart(2, '0')}`,
                      durationMinutes: slotDurationMinutes,
                      databaseId: block.databaseId
                    });
                  }
                }
                
                // Update currentStart to be after this event
                currentStart = new Date(Math.max(currentStart.getTime(), eventEnd.getTime()));
                
                // If we've reached or passed the block end, we're done with this block
                if (currentStart >= blockEnd) break;
              }
              
              // If there's space after the last event, add it
              if (currentStart < blockEnd) {
                const slotStartHour = currentStart.getHours();
                const slotStartMinute = currentStart.getMinutes();
                const slotEndHour = blockEnd.getHours();
                const slotEndMinute = blockEnd.getMinutes();
                
                const slotDurationMinutes = 
                  (slotEndHour * 60 + slotEndMinute) - (slotStartHour * 60 + slotStartMinute);
                
                if (slotDurationMinutes >= 15) { // Only add if at least 15 minutes
                  slots.push({
                    day: new Date(currentDate),
                    startTime: `${slotStartHour.toString().padStart(2, '0')}:${slotStartMinute.toString().padStart(2, '0')}`,
                    endTime: `${slotEndHour.toString().padStart(2, '0')}:${slotEndMinute.toString().padStart(2, '0')}`,
                    durationMinutes: slotDurationMinutes,
                    databaseId: block.databaseId
                  });
                }
              }
            }
          } catch (error) {
            console.error(`🔍 SCHEDULING: Error processing time block: ${JSON.stringify(block)}`, error);
          }
        }
      } else {
        console.log(`🔍 SCHEDULING: ${dayName} is not a working day, skipping`);
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    if (slots.length === 0) {
      console.warn("🔍 SCHEDULING: No time slots were generated. Check working days and time blocks configuration.");
    } else {
      console.log(`🔍 SCHEDULING: Generated ${slots.length} time slots respecting existing events`);
    }
    
    return slots;
  } catch (error) {
    console.error('🔍 SCHEDULING: Error generating time slots:', error);
    return []; // Return empty array on error
  }
}

// Combine adjacent time slots to create larger blocks
function combineTimeSlots(slots: TimeSlot[]): TimeSlot[] {
  if (slots.length === 0) return [];
  
  // Sort slots by day and start time
  const sortedSlots = [...slots].sort((a, b) => {
    const dayComparison = a.day.getTime() - b.day.getTime();
    if (dayComparison !== 0) return dayComparison;
    return a.startTime.localeCompare(b.startTime);
  });
  
  const combinedSlots: TimeSlot[] = [];
  let currentSlot = sortedSlots[0];
  
  for (let i = 1; i < sortedSlots.length; i++) {
    const nextSlot = sortedSlots[i];
    
    // Check if slots are adjacent (same day and end time of current = start time of next)
    if (
      isSameDay(currentSlot.day, nextSlot.day) && 
      currentSlot.endTime === nextSlot.startTime
    ) {
      // Combine slots
      currentSlot = {
        ...currentSlot,
        endTime: nextSlot.endTime,
        durationMinutes: currentSlot.durationMinutes + nextSlot.durationMinutes
      };
    } else {
      // Add current slot to result and move to next
      combinedSlots.push(currentSlot);
      currentSlot = nextSlot;
    }
  }
  
  // Add the last slot
  combinedSlots.push(currentSlot);
  
  return combinedSlots;
}

// Find suitable time slots for a task
function findSuitableSlotsForTask(
  task: SchedulableTask,
  availableSlots: TimeSlot[],
  rules: SchedulingRules
): TimeSlot[] {
  // Determine how much time to allocate
  let requiredDuration = task.estimatedDuration || 30;
  
  // Cap duration based on rules
  if (requiredDuration > rules.longTaskThreshold) {
    requiredDuration = Math.min(requiredDuration, rules.maxLongTaskDuration);
  } else {
    requiredDuration = Math.min(requiredDuration, rules.maxTaskDuration);
  }
  
  // Round up to nearest 15 minutes
  requiredDuration = Math.ceil(requiredDuration / 15) * 15;
  
  // Find slots that are long enough
  return availableSlots.filter(slot => slot.durationMinutes >= requiredDuration);
}

// Function to check if a time slot is appropriate for a specific task based on database
function isTimeSlotMatchingDatabase(slot: TimeSlot, task: SchedulableTask): boolean {
  // If no database ID is associated with this time slot, it's available for all tasks
  if (!slot.databaseId || slot.databaseId === '') {
    return true;
  }
  
  // Check if task's database ID matches the time slot's database ID
  const taskDatabaseId = task.notionDatabaseId || task.source;
  return taskDatabaseId === slot.databaseId;
}

// Import existing calendar function to use the same method
export async function fetchCalendarEvents(userId: string, startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
  const baseUrl = getBaseUrl();
  
  try {
    const response = await fetch(
      `${baseUrl}/api/calendar/events?userId=${encodeURIComponent(userId)}&start=${encodeURIComponent(startDate.toISOString())}&end=${encodeURIComponent(endDate.toISOString())}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch calendar events: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    throw error;
  }
}

// Modify the scheduleTasks function to use the same event fetching approach
export async function scheduleTasks(
  userId: string, 
  startDate: Date, 
  scheduleSource: string,
  daysAhead: number = 7,
  existingEvents: CalendarEvent[] = []
): Promise<CalendarEvent[]> {
  console.log("🔄 SCHEDULING: Starting task scheduling with:", { 
    userId, 
    startDate: startDate.toISOString(), 
    scheduleSource,
    daysAhead 
  });
  
  try {
    // If no existing events were provided, fetch them the same way the calendar view does
    let calendarEvents = existingEvents;
    if (calendarEvents.length === 0) {
      const endDate = addDays(startDate, daysAhead);
      console.log("🔄 SCHEDULING: Fetching calendar events from API");
      
      try {
        calendarEvents = await fetchCalendarEvents(userId, startDate, endDate);
        console.log(`🔄 SCHEDULING: Fetched ${calendarEvents.length} existing calendar events`);
      } catch (error) {
        console.error("🔄 SCHEDULING: Error fetching calendar events:", error);
        // Continue with empty events array if fetch fails
        calendarEvents = [];
      }
    }
    
    // Fetch time blocks based on schedule source
    const isIdealWeek = scheduleSource === 'ideal-week';
    console.log(`🔄 SCHEDULING: Fetching ${isIdealWeek ? 'ideal week' : 'this week'} time blocks`);
    
    const baseUrl = getBaseUrl();
    const timeBlocksResponse = await fetch(
      `${baseUrl}/api/time-blocks?userId=${encodeURIComponent(userId)}&isIdealWeek=${isIdealWeek}`,
      {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json' 
        }
      }
    );
    
    if (!timeBlocksResponse.ok) {
      throw new Error(`Failed to fetch time blocks: ${timeBlocksResponse.statusText}`);
    }
    
    // Parse response and ensure timeBlocks is always an array
    const timeBlocksData = await timeBlocksResponse.json();
    const timeBlocks = Array.isArray(timeBlocksData) ? timeBlocksData : [];
    
    console.log(`🔄 SCHEDULING: Found ${timeBlocks.length} time blocks`);
    
    // Debug time blocks database associations
    const timeBlockDbMap: Record<string, number> = {};
    timeBlocks.forEach((block: any, index: number) => {
      if (index < 10) { // Only log the first 10 to avoid spam
        console.log(`🔄 SCHEDULING: Time block ${block.id || index}: day=${block.day}, time=${block.startTime}-${block.endTime}, databaseId=${block.databaseId || 'NONE'}`);
      }
      
      // Count blocks by database
      if (block.databaseId) {
        timeBlockDbMap[block.databaseId] = (timeBlockDbMap[block.databaseId] || 0) + 1;
      } else {
        timeBlockDbMap['unassigned'] = (timeBlockDbMap['unassigned'] || 0) + 1;
      }
    });
    
    console.log('🔄 SCHEDULING: Time blocks by database ID:', timeBlockDbMap);

    if (timeBlocks.length === 0) {
      console.log("🔄 SCHEDULING: No time blocks found for scheduling");
      return [];
    }
    
    // Fetch databases to get color and other info
    const databasesResponse = await fetch(
      `${baseUrl}/api/notion-databases?userId=${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json' 
        }
      }
    );
    
    if (!databasesResponse.ok) {
      throw new Error(`Failed to fetch databases: ${databasesResponse.statusText}`);
    }
    
    const databases = await databasesResponse.json();
    console.log(`🔄 SCHEDULING: Found ${databases.length} databases`);
    
    // Fetch tasks from each database referenced in the time blocks
    console.log("🔄 SCHEDULING: Fetching tasks");
    
    // Safely extract database IDs - ensure we're working with an array and check for undefined
    const databaseIds = Array.from(
      new Set(
        timeBlocks
          .map((block: any) => block.databaseId)
          .filter((id: string | undefined) => id !== undefined && id !== '')
      )
    );
    
    console.log(`🔄 SCHEDULING: Found ${databaseIds.length} unique database IDs in time blocks`);
    
    const tasksResponse = await fetch(
      `${baseUrl}/api/tasks?userId=${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json' 
        }
      }
    );
    
    if (!tasksResponse.ok) {
      throw new Error(`Failed to fetch tasks: ${tasksResponse.statusText}`);
    }
    
    const allTasks = await tasksResponse.json();
    console.log(`🔄 SCHEDULING: Found ${allTasks.length} total tasks`);
    
    // Associate tasks with their databases and create events
    const scheduledEvents: CalendarEvent[] = [];
    
    // Process each time block
    for (const timeBlock of timeBlocks) {
      // Skip disabled time blocks
      if (!timeBlock.enabled) {
        console.log(`🔄 SCHEDULING: Skipping disabled time block: ${timeBlock.id}`);
        continue;
      }
      
      console.log(`🔄 SCHEDULING: Processing time block:`, timeBlock);
      
      // Check if database ID is specified
      if (!timeBlock.databaseId) {
        console.log(`🔄 SCHEDULING: ERROR - No database ID specified for time block ${timeBlock.id}. Each time block must have a database association.`);
        continue;
      }
      
      // Find the database for this time block
      const database = databases.find((db: any) => db.id === timeBlock.databaseId);
      if (!database) {
        console.log(`🔄 SCHEDULING: ERROR - Database with ID ${timeBlock.databaseId} not found. Make sure the database exists and is active.`);
        continue;
      }
      
      // Filter tasks for this specific database
      const tasksForThisBlock = allTasks.filter((task: any) => {
        // Log task database info for debugging (only for the first few tasks to avoid log spam)
        if (allTasks.indexOf(task) < 5) {
          console.log(`🔄 SCHEDULING: Task DB debug - Task: ${task.title}, notionDatabaseId: ${task.notionDatabaseId}, database_id: ${task.database_id}, source: ${task.source}`);
        }
        
        // Check for exact matches first
        const exactMatch = task.notionDatabaseId === database.id || 
          task.database_id === database.id ||
          task.source === database.id;
        
        if (exactMatch) return true;
        
        // If database has a notionDatabaseId, check that too
        if (database.notionDatabaseId && 
           (task.notionDatabaseId === database.notionDatabaseId || 
            task.database_id === database.notionDatabaseId || 
            task.source === database.notionDatabaseId)) {
          console.log(`🔄 SCHEDULING: Found task ${task.title} via notionDatabaseId match`);
          return true;
        }
        
        // For databases without tasks, log this info
        return false;
      });
      
      console.log(`🔄 SCHEDULING: Found ${tasksForThisBlock.length} tasks for database ${database.name} (ID: ${database.id}, notionDatabaseId: ${database.notionDatabaseId || 'none'})`);
      
      if (tasksForThisBlock.length === 0) {
        console.log(`🔄 SCHEDULING: WARNING - No tasks found for database ${database.name}. Database details:`, { 
          id: database.id, 
          notionDatabaseId: database.notionDatabaseId || 'none',
          name: database.name,
          isActive: database.isActive 
        });
        continue;
      }

      // Calculate time slot based on time block
      // Make sure we have all the required properties
      const dayOfWeek = timeBlock.dayOfWeek || parseInt(timeBlock.day) || new Date().getDay();
      const startHour = timeBlock.startHour || parseInt(timeBlock.startTime?.split(':')[0]) || 9;
      const startMinute = timeBlock.startMinute || parseInt(timeBlock.startTime?.split(':')[1]) || 0;
      const endHour = timeBlock.endHour || parseInt(timeBlock.endTime?.split(':')[0]) || 17;
      const endMinute = timeBlock.endMinute || parseInt(timeBlock.endTime?.split(':')[1]) || 0;
      
      // Log the extracted time values for debugging
      console.log(`🔄 SCHEDULING: Extracted time values - day: ${dayOfWeek}, hours: ${startHour}:${startMinute} - ${endHour}:${endMinute}`);

      const slotStartDate = new Date();
      slotStartDate.setDate(slotStartDate.getDate() + ((dayOfWeek - slotStartDate.getDay() + 7) % 7));
      slotStartDate.setHours(startHour, startMinute, 0, 0);
      
      const slotEndDate = new Date(slotStartDate);
      slotEndDate.setHours(endHour, endMinute, 0, 0);
      
      console.log(`🔄 SCHEDULING: Time slot: ${slotStartDate.toISOString()} to ${slotEndDate.toISOString()}`);
      
      // Check for conflicts with existing calendar events
      const conflictingEvents = calendarEvents.filter(event => {
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);
        
        return (
          (eventStart < slotEndDate && eventEnd > slotStartDate) || // Overlaps
          (eventStart >= slotStartDate && eventEnd <= slotEndDate) // Contained within
        );
      });
      
      console.log(`🔄 SCHEDULING: Found ${conflictingEvents.length} conflicting events`);
      
      // If there are conflicts, adjust the time slot
      let availableSlots = [{start: slotStartDate, end: slotEndDate}];
      
      if (conflictingEvents.length > 0) {
        // Sort conflicting events by start time
        conflictingEvents.sort((a, b) => 
          new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime()
        );
        
        // Recalculate available slots by removing conflicting times
        availableSlots = [];
        let currentStart = slotStartDate;
        
        for (const event of conflictingEvents) {
          const eventStart = new Date(event.start.dateTime);
          const eventEnd = new Date(event.end.dateTime);
          
          // If event starts after current start, we have an available slot
          if (eventStart > currentStart) {
            availableSlots.push({
              start: currentStart,
              end: eventStart
            });
          }
          
          // Move current start to after this event
          if (eventEnd > currentStart) {
            currentStart = eventEnd;
          }
        }
        
        // Add final slot if needed
        if (currentStart < slotEndDate) {
          availableSlots.push({
            start: currentStart,
            end: slotEndDate
          });
        }
        
        console.log(`🔄 SCHEDULING: After conflicts, have ${availableSlots.length} available slots`);
      }
      
      // If we have available slots, schedule tasks within them
      if (availableSlots.length > 0) {
        for (const slot of availableSlots) {
          // Calculate slot duration in minutes
          const slotDuration = (slot.end.getTime() - slot.start.getTime()) / (1000 * 60);
          
          // If slot is too short, skip it
          if (slotDuration < 15) {
            console.log(`🔄 SCHEDULING: Skipping slot that's too short: ${slotDuration} minutes`);
            continue;
          }
          
          console.log(`🔄 SCHEDULING: Processing slot of ${slotDuration} minutes`);
          
          // Select a task to schedule in this slot
          const task = tasksForThisBlock.shift(); // Take the first available task
          
          if (!task) {
            console.log(`🔄 SCHEDULING: No more tasks available for this time block`);
            break;
          }
          
          console.log(`🔄 SCHEDULING: Scheduling task: ${task.title}`);
          
          // Get the color from database or use a default
          const colorId = database?.color || '1';
          
          // Create a calendar event for this task
          const event: CalendarEvent = {
            id: `scheduled-${task.id}-${Date.now()}`,
            summary: task.title,
            description: `Task${database ? ` from ${database.name}` : ''}: ${task.title}
Source: ${scheduleSource}
Task ID: ${task.id}
${database ? `Database ID: ${database.id}` : ''}`,
            start: {
              dateTime: slot.start.toISOString(),
              timeZone: 'UTC'
            },
            end: {
              dateTime: slot.end.toISOString(),
              timeZone: 'UTC'
            },
            colorId: colorId
          };
          
          scheduledEvents.push(event);
          console.log(`🔄 SCHEDULING: Added event for task: ${task.title}`);
        }
      }
    }
    
    console.log(`🔄 SCHEDULING: Generated ${scheduledEvents.length} scheduled events`);
    return scheduledEvents;
    
  } catch (error) {
    console.error("🔄 SCHEDULING: Error in schedule tasks:", error);
    throw error;
  }
} 