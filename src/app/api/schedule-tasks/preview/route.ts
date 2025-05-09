import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/sqliteService';
import { getNotionDatabasesDb, getNotionDatabaseById } from '@/lib/db/notionDatabaseService';
import { scheduleTasks, getDefaultRules, SchedulingRules } from '@/app/services/schedulingService';
import { CalendarEvent } from '@/lib/googleCalendar';
import { parseISO, addDays } from 'date-fns';
import { getBaseUrl } from '@/lib/utils';

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
    const { userId, scheduleSource, startDate, daysAhead = 7, endDate } = await request.json();

    console.log(`📅 API: Received scheduling request:`, { 
      userId, 
      scheduleSource, 
      startDate, 
      daysAhead,
      endDate 
    });

    if (!userId) {
      console.log(`📅 API: Missing required field: userId`);
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!scheduleSource) {
      console.log(`📅 API: Missing required field: scheduleSource`);
      return NextResponse.json({ error: 'Schedule source is required (ideal-week or this-week)' }, { status: 400 });
    }

    // Parse startDate or use current date
    let parsedStartDate: Date;
    if (startDate) {
      parsedStartDate = parseISO(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        console.log(`📅 API: Invalid startDate: ${startDate}`);
        parsedStartDate = new Date();
      }
    } else {
      parsedStartDate = new Date();
    }
    
    // Set to beginning of current day
    parsedStartDate.setHours(0, 0, 0, 0);

    // Calculate effective endDate based on daysAhead if not provided
    let effectiveEndDate: Date;
    if (endDate) {
      effectiveEndDate = parseISO(endDate);
      if (isNaN(effectiveEndDate.getTime())) {
        console.log(`📅 API: Invalid endDate: ${endDate}, calculating from startDate + daysAhead`);
        effectiveEndDate = addDays(parsedStartDate, daysAhead);
      }
    } else {
      effectiveEndDate = addDays(parsedStartDate, daysAhead);
    }

    console.log(`📅 API: Scheduling tasks from ${parsedStartDate.toISOString()} to ${effectiveEndDate.toISOString()}`);
    console.log(`📅 API: Using schedule source: ${scheduleSource}`);

    try {
      // Call the scheduleTasks function to generate events
      const events = await scheduleTasks(
        userId,
        parsedStartDate,
        scheduleSource,
        daysAhead
      );

      console.log(`📅 API: Successfully generated ${events.length} events`);

      if (events.length === 0) {
        console.log(`📅 API: No events were generated. Check if time blocks are properly configured.`);
        
        // Get more detailed diagnostics
        const baseUrl = getBaseUrl();
        try {
          // First check if time blocks exist at all
          const timeBlocksResponse = await fetch(
            `${baseUrl}/api/time-blocks?userId=${encodeURIComponent(userId)}&isIdealWeek=${scheduleSource === 'ideal-week'}`,
            { method: 'GET', headers: { 'Content-Type': 'application/json' } }
          );
          
          if (!timeBlocksResponse.ok) {
            return NextResponse.json({ 
              events: [],
              message: "No events were scheduled - Could not retrieve time blocks.",
              details: ["There was an error accessing your time blocks. Please try again later."]
            });
          }
          
          const timeBlocks = await timeBlocksResponse.json();
          
          if (!timeBlocks || timeBlocks.length === 0) {
            return NextResponse.json({ 
              events: [],
              message: "No events were scheduled - No time blocks found.",
              details: [
                "You need to create time blocks in your " + (scheduleSource === 'ideal-week' ? "Ideal Week" : "This Week") + " view.",
                "Go to Working Times > " + (scheduleSource === 'ideal-week' ? "Ideal Week" : "This Week") + " tab and add time blocks."
              ]
            });
          }
          
          // Check database associations
          const blocksWithoutDatabase = timeBlocks.filter((block: any) => !block.databaseId).length;
          const totalBlocks = timeBlocks.length;
          
          if (blocksWithoutDatabase > 0) {
            return NextResponse.json({ 
              events: [],
              message: "No events were scheduled - Missing database associations.",
              details: [
                `${blocksWithoutDatabase} out of ${totalBlocks} time blocks don't have a database association.`,
                "Each time block must be associated with a specific database.",
                "Go to Working Times > " + (scheduleSource === 'ideal-week' ? "Ideal Week" : "This Week") + " tab and select a database for each time block.",
                "Click on a time block and use the dropdown to select a database."
              ]
            });
          }
          
          // All blocks have databases, so it might be a database-task matching issue
          return NextResponse.json({ 
            events: [],
            message: "No events were scheduled - No matching tasks found.",
            details: [
              "Your time blocks have database associations, but no matching tasks were found.",
              "Make sure that:",
              "1. The associated databases contain tasks",
              "2. The tasks are not marked as completed",
              "3. The tasks have the correct database ID"
            ]
          });
          
        } catch (error) {
          // Fall back to generic message if diagnostics fail
          return NextResponse.json({ 
            events: [],
            message: "No events were scheduled. Please ensure that:",
            details: [
              "1. You have created time blocks in your " + (scheduleSource === 'ideal-week' ? "Ideal Week" : "This Week") + " view",
              "2. Each time block has a database association (select a database for each block)",
              "3. The associated databases contain tasks",
              "4. Your time blocks are enabled"
            ]
          });
        }
      }

      return NextResponse.json({ events });
    } catch (error: any) {
      console.error('📅 API: Error in scheduleTasks function:', error);
      return NextResponse.json(
        { 
          error: `Failed to generate task schedule: ${error.message}`,
          suggestion: "Please check your time blocks configuration and make sure databases are properly set up."
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('📅 API: Error in schedule-tasks/preview:', error);
    return NextResponse.json(
      { error: `Failed to generate task schedule: ${error.message}` },
      { status: 500 }
    );
  }
} 