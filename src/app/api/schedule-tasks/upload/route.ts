import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/sqliteService';
import { getNotionDatabasesDb } from '@/lib/db/notionDatabaseService';
import { createCalendarEvent } from '@/lib/googleCalendar';
import { getBaseUrl } from '@/lib/utils';
import { CalendarEvent } from '@/lib/types';

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
    const { userId, events } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'Events array is required and cannot be empty' }, { status: 400 });
    }

    console.log(`📅 UPLOAD: Received ${events.length} events to upload`);

    // Process each event and create it in Google Calendar
    let successCount = 0;
    let failCount = 0;
    const baseUrl = getBaseUrl();

    for (const event of events) {
      try {
        // Create the event via the calendar events API
        const response = await fetch(`${baseUrl}/api/calendar/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: event.summary,
            description: event.description,
            startDateTime: event.start.dateTime,
            endDateTime: event.end.dateTime,
            timeZone: event.start.timeZone || 'UTC',
            colorId: event.colorId
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error(`📅 UPLOAD: Failed to create event: ${errorData.error || response.statusText}`);
          failCount++;
          continue;
        }

        successCount++;
      } catch (error) {
        console.error(`📅 UPLOAD: Error processing event:`, error);
        failCount++;
      }
    }

    return NextResponse.json({
      success: true,
      totalUploaded: successCount,
      failedUploads: failCount,
      totalEvents: events.length
    });
  } catch (error: any) {
    console.error('Error in schedule-tasks/upload:', error);
    return NextResponse.json(
      { error: `Failed to upload task schedule: ${error.message}` },
      { status: 500 }
    );
  }
} 