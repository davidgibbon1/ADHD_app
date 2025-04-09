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
        energy: row.energy as 'high' | 'medium' | 'high' | undefined,
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

// Schedule tasks based on priority and available time slots
export async function scheduleTasks(
  userId: string,
  database: NotionDatabase,
  startDate: Date,
  endDate: Date,
  existingEvents: CalendarEvent[],
  rules: SchedulingRules = getDefaultRules(),
  prefetchedTasks?: SchedulableTask[]
): Promise<CalendarEvent[]> {
  try {
    console.log(`🔍 SCHEDULING: Starting task scheduling for ${database.name}, dates: ${startDate.toISOString()} - ${endDate.toISOString()}`);
    console.log(`🔍 SCHEDULING: Using database ID: ${database.id}, Notion database ID: ${database.notionDatabaseId || 'none'}`);
    console.log(`🔍 SCHEDULING: Rules:`, JSON.stringify({
      maxTaskDuration: rules.maxTaskDuration,
      maxLongTaskDuration: rules.maxLongTaskDuration,
      priorityWeight: rules.priorityWeight,
      workingDays: rules.workingDays,
      timeBlocks: rules.timeBlocks.length
    }));
    
    // Use pre-fetched tasks if provided, otherwise fetch tasks
    let tasks: SchedulableTask[];
    if (prefetchedTasks && prefetchedTasks.length > 0) {
      console.log(`🔍 SCHEDULING: Using ${prefetchedTasks.length} pre-fetched tasks`);
      tasks = prefetchedTasks;
    } else {
      // Fetch tasks using the updated method that handles ideal-week and this-week specially
      console.log("🔍 SCHEDULING: No pre-fetched tasks, fetching tasks directly...");
      tasks = await fetchTasksForScheduling(database, existingEvents, rules);
    }
    
    console.log(`🔍 SCHEDULING: Using ${tasks.length} tasks for scheduling`);
    
    if (tasks.length === 0) {
      console.log("🔍 SCHEDULING: No tasks available to schedule. Check if the Notion database has tasks in it.");
      return [];
    }
    
    // Calculate scores for each task
    const scoredTasks = tasks.map(task => ({
      ...task,
      score: calculateTaskScore(task, rules)
    }));
    
    console.log(`🔍 SCHEDULING: Scored ${scoredTasks.length} tasks by priority and other factors`);
    
    // Sort tasks by score (highest first)
    const sortedTasks = scoredTasks.sort((a, b) => (b.score || 0) - (a.score || 0));
    
    // Generate available time slots with existing events already handled
    console.log("🔍 SCHEDULING: Generating available time slots...");
    console.log("🔍 SCHEDULING: Rules workingDays:", JSON.stringify(rules.workingDays));
    console.log("🔍 SCHEDULING: Rules timeBlocks:", JSON.stringify(rules.timeBlocks.map(tb => ({
      day: tb.day, 
      start: tb.startTime, 
      end: tb.endTime,
      enabled: tb.enabled,
      databaseId: tb.databaseId || 'none'
    }))));
    
    let availableSlots = generateTimeSlots(startDate, endDate, rules, existingEvents);
    console.log(`🔍 SCHEDULING: Generated ${availableSlots.length} available time slots`);
    
    if (availableSlots.length === 0) {
      console.log("🔍 SCHEDULING: No available time slots. Check working days and time blocks configuration.");
      return [];
    }
    
    // Schedule each task
    const scheduledEvents: CalendarEvent[] = [];
    
    console.log("🔍 SCHEDULING: Scheduling individual tasks...");
    for (const task of sortedTasks) {
      console.log(`🔍 SCHEDULING: Processing task: ${task.title} (score: ${task.score?.toFixed(2) || 'unscored'})`);
      console.log(`🔍 SCHEDULING: Task database ID: ${task.notionDatabaseId || 'unknown'}`);
      
      // Determine total required duration for this task
      let requiredDuration = task.estimatedDuration || 30;
      console.log(`🔍 SCHEDULING: Task ${task.title} requires ${requiredDuration} minutes`);
      
      // Filter slots by database association
      let appropriateSlots = availableSlots
        .filter(slot => {
          // If the slot has no database ID, it can be used for any task
          if (!slot.databaseId || slot.databaseId === '') {
            return true;
          }
          
          // If the task has a database ID, it must match the slot's database ID
          return slot.databaseId === task.notionDatabaseId;
        })
        .sort((a, b) => {
          // Sort by day first, then by start time
          const dayDiff = a.day.getTime() - b.day.getTime();
          if (dayDiff !== 0) return dayDiff;
          
          // If same day, sort by start time
          const [aHour, aMin] = a.startTime.split(':').map(Number);
          const [bHour, bMin] = b.startTime.split(':').map(Number);
          
          const aMinutes = aHour * 60 + aMin;
          const bMinutes = bHour * 60 + bMin;
          return aMinutes - bMinutes;
        });
      
      console.log(`🔍 SCHEDULING: Found ${appropriateSlots.length} appropriate slots for task ${task.id}`);
      
      if (appropriateSlots.length === 0) {
        console.log(`🔍 SCHEDULING: No appropriate slots found for task ${task.id} - skipping`);
        continue;
      }
      
      // Try to schedule the entire task in one slot if possible
      const suitableFullSlots = appropriateSlots.filter(slot => slot.durationMinutes >= requiredDuration);
      
      if (suitableFullSlots.length > 0) {
        // Schedule the task in a single slot
        const selectedSlot = suitableFullSlots[0];
        
        // Calculate start and end times
        const [startHour, startMinute] = selectedSlot.startTime.split(':').map(Number);
        const startDateTime = setMinutes(setHours(new Date(selectedSlot.day), startHour), startMinute);
        
        const endDateTime = new Date(startDateTime);
        endDateTime.setMinutes(endDateTime.getMinutes() + requiredDuration);
        
        console.log(`🔍 SCHEDULING: Scheduling task "${task.title}" at ${startDateTime.toISOString()} for ${requiredDuration} minutes`);
        
        // Create calendar event
        const event: CalendarEvent = {
          id: `scheduled-${task.id}-${Date.now()}`,
          summary: task.title,
          description: `Task from ${task.notionDatabaseName || 'Unknown'}: ${task.title}\nPriority: ${task.metadata?.priority || 'low'}\nSource: ${database.id === 'ideal-week' ? 'Ideal Week' : 'This Week'}\nTask ID: ${task.id}`,
          start: {
            dateTime: startDateTime.toISOString(),
            timeZone: 'UTC',
          },
          end: {
            dateTime: endDateTime.toISOString(),
            timeZone: 'UTC',
          },
          // Add some color based on priority
          colorId: task.metadata?.priority === 'high' ? '4' : task.metadata?.priority === 'medium' ? '5' : '6',
        };
        
        scheduledEvents.push(event);
        
        // Remove the allocated time from available slots by updating the slot if partial, or removing if fully used
        const slotStartMinutes = startHour * 60 + startMinute;
        const eventEndMinutes = endDateTime.getHours() * 60 + endDateTime.getMinutes();
        const slotEndHour = parseInt(selectedSlot.endTime.split(':')[0]);
        const slotEndMinute = parseInt(selectedSlot.endTime.split(':')[1]);
        const slotEndMinutes = slotEndHour * 60 + slotEndMinute;
        
        // If we used the entire slot, remove it
        if (slotStartMinutes === slotStartMinutes && eventEndMinutes === slotEndMinutes) {
          availableSlots = availableSlots.filter(s => s !== selectedSlot);
        } else {
          // If we only used part of the slot, update it
          const newStartTime = `${endDateTime.getHours().toString().padStart(2, '0')}:${endDateTime.getMinutes().toString().padStart(2, '0')}`;
          const newDuration = slotEndMinutes - eventEndMinutes;
          
          // Remove the original slot
          availableSlots = availableSlots.filter(s => s !== selectedSlot);
          
          // Add the updated slot if there's still time left
          if (newDuration >= 15) {
            availableSlots.push({
              day: selectedSlot.day,
              startTime: newStartTime,
              endTime: selectedSlot.endTime,
              durationMinutes: newDuration,
              databaseId: selectedSlot.databaseId
            });
          }
        }
      } else {
        // If no single slot can fit the entire task, try to split it
        console.log(`🔍 SCHEDULING: No slot can fit entire task duration (${requiredDuration} min), trying to split`);
        
        // Only allow splitting for tasks > 60 minutes
        if (requiredDuration > 60) {
          let remainingDuration = requiredDuration;
          let taskPart = 1;
          
          // Try to schedule the task in multiple parts
          while (remainingDuration > 0 && appropriateSlots.length > 0) {
            // Find the largest available slot that can fit in our time frame
            const largestSlot = appropriateSlots.reduce((max, slot) => 
              slot.durationMinutes > max.durationMinutes ? slot : max, appropriateSlots[0]);
            
            // Calculate how much of the task to schedule (use entire slot or cap at 60 min)
            const partDuration = Math.min(largestSlot.durationMinutes, 60, remainingDuration);
            
            // Calculate start and end times
            const [startHour, startMinute] = largestSlot.startTime.split(':').map(Number);
            const startDateTime = setMinutes(setHours(new Date(largestSlot.day), startHour), startMinute);
            
            const endDateTime = new Date(startDateTime);
            endDateTime.setMinutes(endDateTime.getMinutes() + partDuration);
            
            console.log(`🔍 SCHEDULING: Scheduling task "${task.title}" (part ${taskPart}) at ${startDateTime.toISOString()} for ${partDuration} minutes`);
            
            // Create calendar event
            const event: CalendarEvent = {
              id: `scheduled-${task.id}-part${taskPart}-${Date.now()}`,
              summary: `${task.title} (${taskPart})`,
              description: `Task from ${task.notionDatabaseName || 'Unknown'}: ${task.title} (Part ${taskPart})\nPriority: ${task.metadata?.priority || 'low'}\nSource: ${database.id === 'ideal-week' ? 'Ideal Week' : 'This Week'}\nTask ID: ${task.id}`,
              start: {
                dateTime: startDateTime.toISOString(),
                timeZone: 'UTC',
              },
              end: {
                dateTime: endDateTime.toISOString(),
                timeZone: 'UTC',
              },
              // Add some color based on priority
              colorId: task.metadata?.priority === 'high' ? '4' : task.metadata?.priority === 'medium' ? '5' : '6',
            };
            
            scheduledEvents.push(event);
            
            // Update remaining duration
            remainingDuration -= partDuration;
            taskPart++;
            
            // Remove or update the used slot
            const slotStartMinutes = startHour * 60 + startMinute;
            const eventEndMinutes = endDateTime.getHours() * 60 + endDateTime.getMinutes();
            const slotEndHour = parseInt(largestSlot.endTime.split(':')[0]);
            const slotEndMinute = parseInt(largestSlot.endTime.split(':')[1]);
            const slotEndMinutes = slotEndHour * 60 + slotEndMinute;
            
            // If we used the entire slot, remove it
            if (eventEndMinutes >= slotEndMinutes) {
              availableSlots = availableSlots.filter(s => s !== largestSlot);
              appropriateSlots = appropriateSlots.filter(s => s !== largestSlot);
            } else {
              // If we only used part of the slot, update it
              const newStartTime = `${endDateTime.getHours().toString().padStart(2, '0')}:${endDateTime.getMinutes().toString().padStart(2, '0')}`;
              const newDuration = slotEndMinutes - eventEndMinutes;
              
              // Remove the original slot
              availableSlots = availableSlots.filter(s => s !== largestSlot);
              appropriateSlots = appropriateSlots.filter(s => s !== largestSlot);
              
              // Add the updated slot if there's still time left
              if (newDuration >= 15) {
                const updatedSlot = {
                  day: largestSlot.day,
                  startTime: newStartTime,
                  endTime: largestSlot.endTime,
                  durationMinutes: newDuration,
                  databaseId: largestSlot.databaseId
                };
                availableSlots.push(updatedSlot);
                appropriateSlots.push(updatedSlot);
              }
            }
          }
          
          if (remainingDuration > 0) {
            console.log(`🔍 SCHEDULING: Could only schedule ${requiredDuration - remainingDuration} minutes out of ${requiredDuration} minutes for task "${task.title}"`);
          } else {
            console.log(`🔍 SCHEDULING: Successfully scheduled all ${requiredDuration} minutes for task "${task.title}" in ${taskPart - 1} parts`);
          }
        } else {
          // For tasks under 60 minutes that don't fit in any slot, try to find the largest available slot
          const largestSlot = appropriateSlots.reduce((max, slot) => 
            slot.durationMinutes > max.durationMinutes ? slot : max, appropriateSlots[0]);
          
          // If there's at least 15 minutes available, schedule what we can
          if (largestSlot.durationMinutes >= 15) {
            const partDuration = largestSlot.durationMinutes;
            
            // Calculate start and end times
            const [startHour, startMinute] = largestSlot.startTime.split(':').map(Number);
            const startDateTime = setMinutes(setHours(new Date(largestSlot.day), startHour), startMinute);
            
            const endDateTime = new Date(startDateTime);
            endDateTime.setMinutes(endDateTime.getMinutes() + partDuration);
            
            console.log(`🔍 SCHEDULING: Scheduling truncated task "${task.title}" at ${startDateTime.toISOString()} for ${partDuration} minutes (requested ${requiredDuration})`);
            
            // Create calendar event
            const event: CalendarEvent = {
              id: `scheduled-${task.id}-partial-${Date.now()}`,
              summary: `${task.title} (Partial)`,
              description: `Task from ${task.notionDatabaseName || 'Unknown'}: ${task.title} (Partial scheduling - requested ${requiredDuration} min)\nPriority: ${task.metadata?.priority || 'low'}\nSource: ${database.id === 'ideal-week' ? 'Ideal Week' : 'This Week'}\nTask ID: ${task.id}`,
              start: {
                dateTime: startDateTime.toISOString(),
                timeZone: 'UTC',
              },
              end: {
                dateTime: endDateTime.toISOString(),
                timeZone: 'UTC',
              },
              // Add some color based on priority
              colorId: task.metadata?.priority === 'high' ? '4' : task.metadata?.priority === 'medium' ? '5' : '6',
            };
            
            scheduledEvents.push(event);
            
            // Remove the used slot
            availableSlots = availableSlots.filter(s => s !== largestSlot);
          } else {
            console.log(`🔍 SCHEDULING: No suitable slots available for task "${task.title}"`);
          }
        }
      }
    }
    
    console.log(`🔍 SCHEDULING: Successfully scheduled ${scheduledEvents.length} events`);
    
    if (scheduledEvents.length === 0) {
      console.log("🔍 SCHEDULING: No events could be scheduled. This could be due to task constraints or limited available time slots.");
    }
    
    return scheduledEvents;
  } catch (error) {
    console.error('🔍 SCHEDULING: Error scheduling tasks:', error);
    throw error;
  }
} 