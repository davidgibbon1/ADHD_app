import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/sqliteService';
import { getNotionDatabasesDb } from '@/lib/db/notionDatabaseService'; 
import { scheduleTasks } from '@/app/services/schedulingService';
import { CalendarEvent, createCalendarEvent } from '@/lib/googleCalendar';

// Initialize databases
function initializeDatabase() {
  // Initialize main tasks database
  const db = getDatabase();
  
  // Create scheduling_results table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduling_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      databaseId TEXT NOT NULL,
      eventIds TEXT NOT NULL,
      scheduledAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      tasksScheduled INTEGER NOT NULL
    )
  `);
  
  // Also ensure Notion databases are initialized
  getNotionDatabasesDb();
  
  return db;
}

// Function to add an event to Google Calendar
async function addEventToCalendar(userId: string, event: CalendarEvent): Promise<CalendarEvent> {
  try {
    // Get user's access token from the database
    const db = getDatabase();
    const stmt = db.prepare('SELECT accessToken FROM google_auth WHERE userId = ? ORDER BY createdAt DESC LIMIT 1');
    const auth = stmt.get(userId) as { accessToken: string } | undefined;
    
    if (!auth || !auth.accessToken) {
      throw new Error('User not authenticated with Google Calendar');
    }
    
    // Create the event using the existing function
    return await createCalendarEvent(
      event.summary,
      event.start.dateTime,
      event.end.dateTime,
      event.description || '',
      auth.accessToken,
      event.start.timeZone
    );
  } catch (error) {
    console.error('Error adding event to calendar:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Initialize database
    const db = initializeDatabase();
    
    // Get authenticated user from the request
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Extract userId from the request body
    const body = await request.json();
    const { userId, databaseId, startDate, endDate } = body;
    
    // Validate required fields
    if (!userId || !databaseId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, databaseId, startDate, endDate' },
        { status: 400 }
      );
    }
    
    // Fetch the database
    const stmt = db.prepare('SELECT * FROM notion_databases WHERE id = ? AND userId = ?');
    const database = stmt.get(databaseId, userId) as any;
    
    if (!database) {
      return NextResponse.json(
        { error: 'Database not found or not authorized' },
        { status: 404 }
      );
    }
    
    // Fetch scheduling rules
    const rulesStmt = db.prepare('SELECT * FROM scheduling_rules WHERE userId = ? ORDER BY id DESC LIMIT 1');
    const rules = rulesStmt.get(userId) as any;
    
    // Fetch existing events from Google Calendar
    const existingEventsResponse = await fetch(
      `${request.nextUrl.origin}/api/google-calendar/events?userId=${userId}&startDate=${new Date(startDate).toISOString().split('T')[0]}&endDate=${new Date(endDate).toISOString().split('T')[0]}`,
      { headers: { 'Cookie': request.headers.get('cookie') || '' } }
    );
    
    if (!existingEventsResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch existing events' },
        { status: 500 }
      );
    }
    
    const existingEvents = await existingEventsResponse.json();
    
    // Schedule tasks
    const scheduledEvents = await scheduleTasks(
      userId,
      database,
      new Date(startDate),
      new Date(endDate),
      existingEvents,
      rules ? JSON.parse(rules.workingDays || '{}') : undefined
    );
    
    // Add events to Google Calendar
    const addedEvents = [];
    for (const event of scheduledEvents) {
      try {
        const addedEvent = await addEventToCalendar(userId, event);
        addedEvents.push(addedEvent);
      } catch (error) {
        console.error('Error adding event to calendar:', error);
      }
    }
    
    // Save scheduling results
    if (addedEvents.length > 0) {
      const insertStmt = db.prepare(`
        INSERT INTO scheduling_results 
        (userId, databaseId, eventIds, startDate, endDate, tasksScheduled) 
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      insertStmt.run(
        userId,
        databaseId,
        JSON.stringify(addedEvents.map(event => event.id)),
        startDate,
        endDate,
        addedEvents.length
      );
    }
    
    return NextResponse.json({
      success: true,
      events: addedEvents,
      totalScheduled: addedEvents.length
    });
    
  } catch (error) {
    console.error('Error scheduling tasks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    );
  }
}