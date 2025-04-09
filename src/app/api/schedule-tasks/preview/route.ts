import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/sqliteService';
import { getNotionDatabasesDb, getNotionDatabaseById } from '@/lib/db/notionDatabaseService';
import { scheduleTasks, getDefaultRules, SchedulingRules } from '@/app/services/schedulingService';
import { CalendarEvent } from '@/lib/googleCalendar';

// Interface for scheduling rules from database
interface SchedulingRulesRow {
  id: number;
  userId: string;
  maxTaskDuration: number;
  maxLongTaskDuration: number;
  longTaskThreshold: number;
  priorityWeight: number;
  timeWeight: number;
  randomnessFactor: number;
  workingDays: string; // JSON string
  timeBlocks: string;  // JSON string
  createdAt: string;   // Timestamp
  updatedAt: string;   // Timestamp
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user from the request
    const body = await request.json();
    const { userId, scheduleSource, startDate, endDate, daysAhead } = body;
    
    console.log("🔄 PREVIEW API: Request received:", { userId, scheduleSource, startDate, daysAhead });
    
    // Validate required fields
    if (!userId || !scheduleSource || !startDate) {
      console.error("🔄 PREVIEW API: Missing required fields");
      return NextResponse.json(
        { error: 'Missing required fields: userId, scheduleSource, startDate' },
        { status: 400 }
      );
    }
    
    // Validate scheduleSource is valid
    if (scheduleSource !== 'ideal-week' && scheduleSource !== 'this-week') {
      console.error("🔄 PREVIEW API: Invalid scheduleSource value");
      return NextResponse.json(
        { error: 'scheduleSource must be either "ideal-week" or "this-week"' },
        { status: 400 }
      );
    }
    
    // Calculate end date if not provided but daysAhead is
    let effectiveEndDate = endDate;
    if (!effectiveEndDate && daysAhead) {
      const start = new Date(startDate);
      const end = new Date(start);
      end.setDate(start.getDate() + (daysAhead || 7));
      effectiveEndDate = end.toISOString();
      console.log("🔄 PREVIEW API: Calculated end date:", effectiveEndDate);
    }
    
    // Initialize database
    const db = getDatabase();
    
    // Create mock database for schedule source
    const sourceDatabase = {
      id: scheduleSource,
      name: scheduleSource === 'ideal-week' ? 'Ideal Week Schedule' : 'This Week Schedule',
      userId: userId,
      notionDatabaseId: null,
      isActive: true,
      lastSynced: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      color: scheduleSource === 'ideal-week' ? '#4CAF50' : '#2196F3'
    };
    
    // Fetch scheduling rules from the main database
    console.log("🔄 PREVIEW API: Checking for scheduling rules for user:", userId);
    const rulesStmt = db.prepare('SELECT * FROM scheduling_rules WHERE userId = ? ORDER BY id DESC LIMIT 1');
    const rulesRow = rulesStmt.get(userId) as SchedulingRulesRow | undefined;
    console.log("🔄 PREVIEW API: Found scheduling rules:", rulesRow ? true : false);
    
    // Convert the database row to a SchedulingRules object if it exists
    let rules: SchedulingRules | undefined;
    if (rulesRow) {
      try {
        // Ensure workingDays and timeBlocks are properly parsed
        let workingDays;
        let timeBlocks;
        
        try {
          workingDays = JSON.parse(rulesRow.workingDays);
          console.log("🔄 PREVIEW API: Parsed workingDays:", workingDays);
        } catch (error) {
          console.error("🔄 PREVIEW API: Error parsing workingDays:", error);
          workingDays = {
            monday: true,
            tuesday: true,
            wednesday: true,
            thursday: true,
            friday: true,
            saturday: false,
            sunday: false
          };
        }
        
        try {
          timeBlocks = JSON.parse(rulesRow.timeBlocks);
          console.log("🔄 PREVIEW API: Parsed timeBlocks:", {
            count: timeBlocks.length,
            sample: timeBlocks.slice(0, 2)
          });
        } catch (error) {
          console.error("🔄 PREVIEW API: Error parsing timeBlocks:", error);
          timeBlocks = [
            { id: '1', day: 'weekday', startTime: '09:00', endTime: '17:00', enabled: true }
          ];
        }
        
        rules = {
          maxTaskDuration: rulesRow.maxTaskDuration,
          maxLongTaskDuration: rulesRow.maxLongTaskDuration,
          longTaskThreshold: rulesRow.longTaskThreshold,
          priorityWeight: rulesRow.priorityWeight,
          timeWeight: rulesRow.timeWeight,
          randomnessFactor: rulesRow.randomnessFactor,
          workingDays,
          timeBlocks
        };
        
        console.log("🔄 PREVIEW API: Parsed scheduling rules:", {
          maxTaskDuration: rules.maxTaskDuration,
          maxLongTaskDuration: rules.maxLongTaskDuration,
          workingDays,
          timeBlocks: timeBlocks.length
        });
      } catch (error) {
        console.error("🔄 PREVIEW API: Error processing scheduling rules:", error);
        rules = getDefaultRules();
      }
    } else {
      console.log("🔄 PREVIEW API: No scheduling rules found, using defaults");
      rules = getDefaultRules();
    }
    
    // Fetch existing calendar events to avoid conflicts
    console.log(`🔄 PREVIEW API: Fetching existing calendar events: ${request.url}`);
    try {
      const calendarResponse = await fetch(
        `/api/calendar/events?userId=${encodeURIComponent(userId)}&start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(effectiveEndDate)}`,
        { headers: request.headers }
      );
      
      if (!calendarResponse.ok) {
        console.error(`🔄 PREVIEW API: Error fetching existing events: ${calendarResponse.status}`);
        throw new Error(`Failed to fetch existing events: ${calendarResponse.status}`);
      }
      
      const existingEvents = await calendarResponse.json();
      console.log(`🔄 PREVIEW API: Fetched existing events: ${existingEvents.length}`);
      
      // Now use the updated scheduleTasks function that properly handles ideal-week and this-week
      console.log(`🔄 PREVIEW API: Scheduling tasks for ${scheduleSource}`);
      
      // We don't need to fetch tasks separately since scheduleTasks will handle that based on scheduleSource
      const scheduledEvents = await scheduleTasks(
        userId,
        sourceDatabase,
        new Date(startDate),
        new Date(effectiveEndDate),
        existingEvents,
        rules
      );
      
      console.log(`🔄 PREVIEW API: Successfully scheduled ${scheduledEvents.length} events`);
      
      // Return the scheduled events
      return NextResponse.json({
        success: true,
        events: scheduledEvents,
        count: scheduledEvents.length
      });
      
    } catch (error) {
      console.error("🔄 PREVIEW API: Error in scheduling workflow:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unknown error occurred" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("🔄 PREVIEW API: Unhandled error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error occurred" },
      { status: 500 }
    );
  }
} 