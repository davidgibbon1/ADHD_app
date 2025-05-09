import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/sqliteService';
import { getOrCreateUserId } from '@/lib/localStorage/storageUtils';

// Interface for a time block
interface TimeBlock {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
  color: string;
  label: string;
  isIdealWeek: boolean;
  dayOfWeek?: number;
  startHour?: number;
  startMinute?: number;
  endHour?: number;
  endMinute?: number;
  databaseId?: string;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const isIdealWeek = url.searchParams.get('isIdealWeek') === 'true';
    
    if (!userId) {
      return NextResponse.json([], { status: 200 });
    }
    
    const db = getDatabase();
    
    // Create time_blocks table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS time_blocks (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        day TEXT NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        color TEXT,
        label TEXT,
        isIdealWeek INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        databaseId TEXT
      )
    `);
    
    // Get time blocks from the database
    const query = `
      SELECT * FROM time_blocks 
      WHERE userId = ? AND isIdealWeek = ?
    `;
    
    const rawTimeBlocks = db.prepare(query).all(userId, isIdealWeek ? 1 : 0) as TimeBlock[];
    
    // Process time blocks to ensure they have proper format for scheduling
    const timeBlocks = rawTimeBlocks.map(block => {
      // Convert day string to dayOfWeek number (0-6, where 0 is Sunday)
      let dayOfWeek: number | undefined = undefined;
      
      // Try to parse the day field
      const lowerDay = (block.day || '').toLowerCase();
      if (lowerDay === 'sunday') dayOfWeek = 0;
      else if (lowerDay === 'monday') dayOfWeek = 1;
      else if (lowerDay === 'tuesday') dayOfWeek = 2;
      else if (lowerDay === 'wednesday') dayOfWeek = 3;
      else if (lowerDay === 'thursday') dayOfWeek = 4;
      else if (lowerDay === 'friday') dayOfWeek = 5;
      else if (lowerDay === 'saturday') dayOfWeek = 6;
      else {
        // Try to parse as a number
        const parsed = parseInt(lowerDay);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 6) {
          dayOfWeek = parsed;
        } else if (lowerDay === 'weekday') {
          // Default to Monday for "weekday"
          dayOfWeek = 1;
        } else if (lowerDay === 'weekend') {
          // Default to Saturday for "weekend"
          dayOfWeek = 6;
        } else {
          // Default to current day if unparseable
          dayOfWeek = new Date().getDay();
        }
      }
      
      // Parse start and end times
      let startHour = 9, startMinute = 0, endHour = 17, endMinute = 0;
      
      if (block.startTime) {
        const [hourStr, minuteStr] = block.startTime.split(':');
        const hour = parseInt(hourStr);
        const minute = parseInt(minuteStr);
        if (!isNaN(hour) && !isNaN(minute)) {
          startHour = hour;
          startMinute = minute;
        }
      }
      
      if (block.endTime) {
        const [hourStr, minuteStr] = block.endTime.split(':');
        const hour = parseInt(hourStr);
        const minute = parseInt(minuteStr);
        if (!isNaN(hour) && !isNaN(minute)) {
          endHour = hour;
          endMinute = minute;
        }
      }
      
      return {
        ...block,
        dayOfWeek,
        startHour,
        startMinute,
        endHour,
        endMinute
      };
    });
    
    console.log(`Returning ${timeBlocks.length} time blocks for userId ${userId}, isIdealWeek: ${isIdealWeek}`);
    
    // Return the array directly, not wrapped in an object
    return NextResponse.json(timeBlocks);
  } catch (error) {
    console.error('Error fetching time blocks:', error);
    // Return an empty array instead of an error
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, timeBlocks } = await request.json();
    
    if (!userId || !timeBlocks) {
      return NextResponse.json({ error: 'User ID and time blocks are required' }, { status: 400 });
    }
    
    const db = getDatabase();
    
    // Begin a transaction
    db.exec('BEGIN TRANSACTION');
    
    try {
      // Create time_blocks table if it doesn't exist
      db.exec(`
        CREATE TABLE IF NOT EXISTS time_blocks (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          day TEXT NOT NULL,
          startTime TEXT NOT NULL,
          endTime TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          color TEXT,
          label TEXT,
          isIdealWeek INTEGER NOT NULL DEFAULT 0,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          databaseId TEXT
        )
      `);
      
      // Get the current time
      const now = Date.now();
      
      // Get the isIdealWeek flag from the first time block (all blocks should have the same value)
      const isIdealWeek = timeBlocks.length > 0 ? timeBlocks[0].isIdealWeek : false;
      
      // Delete existing time blocks for this user and ideal week setting
      const deleteStmt = db.prepare(`
        DELETE FROM time_blocks 
        WHERE userId = ? AND isIdealWeek = ?
      `);
      deleteStmt.run(userId, isIdealWeek ? 1 : 0);
      
      // Insert new time blocks
      const insertStmt = db.prepare(`
        INSERT INTO time_blocks (
          id, userId, day, startTime, endTime, 
          enabled, color, label, isIdealWeek, 
          createdAt, updatedAt, databaseId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const block of timeBlocks) {
        insertStmt.run(
          block.id,
          userId,
          block.day,
          block.startTime,
          block.endTime,
          block.enabled ? 1 : 0,
          block.color,
          block.label,
          block.isIdealWeek ? 1 : 0,
          now,
          now,
          block.databaseId || null
        );
      }
      
      // Commit the transaction
      db.exec('COMMIT');
      
      return NextResponse.json({ success: true });
    } catch (error) {
      // Rollback the transaction on error
      db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error saving time blocks:', error);
    return NextResponse.json({ error: 'Failed to save time blocks' }, { status: 500 });
  }
} 