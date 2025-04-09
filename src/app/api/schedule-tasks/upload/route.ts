import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/sqliteService';
import { getNotionDatabasesDb } from '@/lib/db/notionDatabaseService';
import { createCalendarEvent } from '@/lib/googleCalendar';

// Define interface for calendar events
interface CalendarEventData {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  colorId?: string;
  isTemp?: boolean;
}

// Define interface for scheduling results
interface SchedulingResult {
  id: number;
  userId: string;
  scheduleSource: string;
  eventIds: string;
  scheduledAt: string;
  startDate: string;
  endDate: string;
  tasksScheduled: number;
}

// Initialize database
function initializeDatabase() {
  // Initialize main tasks database
  const db = getDatabase();
  
  // Create scheduling_results table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduling_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      scheduleSource TEXT NOT NULL,
      eventIds TEXT NOT NULL,
      scheduledAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      tasksScheduled INTEGER NOT NULL
    )
  `);
  
  // Ensure scheduleSource column exists (for backward compatibility)
  try {
    // Check if the column exists
    const columns = db.prepare("PRAGMA table_info(scheduling_results)").all() as Array<{name: string}>;
    const hasScheduleSource = columns.some(col => col.name === 'scheduleSource');
    
    if (!hasScheduleSource) {
      // If it doesn't exist, add it
      db.exec(`ALTER TABLE scheduling_results ADD COLUMN scheduleSource TEXT`);
      
      // Update existing records to have a default value
      db.exec(`UPDATE scheduling_results SET scheduleSource = databaseId WHERE scheduleSource IS NULL`);
    }
  } catch (error) {
    console.error('Error checking/updating column:', error);
  }
  
  // Also ensure Notion databases are initialized
  getNotionDatabasesDb();
  
  return db;
}

// Function to add an event to Google Calendar
async function addEventToCalendar(userId: string, event: CalendarEventData): Promise<CalendarEventData> {
  try {
    // Get user's access token from the database or cookies
    const db = getDatabase();
    const tokenStmt = db.prepare('SELECT token FROM user_tokens WHERE userId = ? AND service = "google" LIMIT 1');
    const tokenRow = tokenStmt.get(userId) as { token: string } | undefined;
    
    if (!tokenRow) {
      throw new Error('Google Calendar token not found');
    }
    
    // The token stored in the database is already the access token
    const accessToken = tokenRow.token;
    
    // Create event in Google Calendar using the Google Calendar API
    const createdEvent = await createCalendarEvent(
      event.summary,
      event.start.dateTime,
      event.end.dateTime,
      event.description || '',
      accessToken,
      event.start.timeZone
    );
    
    return createdEvent;
  } catch (error) {
    console.error('Error adding event to calendar:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { userId, events } = body;
    
    // Validate input
    if (!userId || !events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request. userId and events array are required' },
        { status: 400 }
      );
    }
    
    // Initialize database
    const db = initializeDatabase();
    
    // Create a map to store events by their schedule source
    const eventsBySource: Record<string, CalendarEventData[]> = {};
    
    // Group events by schedule source
    for (const event of events) {
      // Extract source from the event description or use a default
      let scheduleSource = 'unknown';
      
      if (event.description) {
        // Try to extract the source from description
        const sourceMatch = event.description.match(/Source: (ideal-week|this-week)/i);
        if (sourceMatch && sourceMatch[1]) {
          scheduleSource = sourceMatch[1].toLowerCase();
        }
      }
      
      // Add to map
      if (!eventsBySource[scheduleSource]) {
        eventsBySource[scheduleSource] = [];
      }
      eventsBySource[scheduleSource].push(event);
    }
    
    // Track overall results
    let totalUploaded = 0;
    const allEventIds: string[] = [];
    let startDate = '';
    let endDate = '';
    
    // Default schedule source if none is found in events
    const defaultScheduleSource = events[0]?.description?.includes('Ideal Week') ? 'ideal-week' : 'this-week';
    
    // Process all events
    for (const [scheduleSource, sourceEvents] of Object.entries(eventsBySource)) {
      const uploadedEvents: CalendarEventData[] = [];
      
      // Upload each event to Google Calendar
      for (const event of sourceEvents) {
        try {
          // Skip events marked as temporary
          if (event.isTemp) {
            const { isTemp, ...eventWithoutTemp } = event;
            const uploadedEvent = await addEventToCalendar(userId, eventWithoutTemp);
            
            if (uploadedEvent && uploadedEvent.id) {
              uploadedEvents.push(uploadedEvent);
              allEventIds.push(uploadedEvent.id);
              
              // Update date range
              if (!startDate || new Date(event.start.dateTime) < new Date(startDate)) {
                startDate = event.start.dateTime;
              }
              
              if (!endDate || new Date(event.end.dateTime) > new Date(endDate)) {
                endDate = event.end.dateTime;
              }
            }
          } else {
            // Event is already uploaded, just keep track of it
            if (event.id) {
              allEventIds.push(event.id);
              
              // Update date range
              if (!startDate || new Date(event.start.dateTime) < new Date(startDate)) {
                startDate = event.start.dateTime;
              }
              
              if (!endDate || new Date(event.end.dateTime) > new Date(endDate)) {
                endDate = event.end.dateTime;
              }
            }
          }
        } catch (error) {
          console.error(`Error uploading event "${event.summary}":`, error);
          // Continue with the next event
        }
      }
      
      totalUploaded += uploadedEvents.length;
      
      // Record this batch of uploads in the database
      if (uploadedEvents.length > 0) {
        try {
          // Insert scheduling result
          const stmt = db.prepare(`
            INSERT INTO scheduling_results 
            (userId, scheduleSource, eventIds, startDate, endDate, tasksScheduled)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          
          stmt.run(
            userId,
            scheduleSource || defaultScheduleSource,
            JSON.stringify(uploadedEvents.map(e => e.id)),
            startDate,
            endDate,
            uploadedEvents.length
          );
        } catch (dbError) {
          console.error('Error recording scheduling results:', dbError);
          // Continue anyway, this is just for tracking
        }
      }
    }
    
    // Return success
    return NextResponse.json({
      success: true,
      totalUploaded,
      eventIds: allEventIds
    });
  } catch (error) {
    console.error('Error in schedule upload:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
} 