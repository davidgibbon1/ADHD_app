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
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const isIdealWeek = url.searchParams.get('isIdealWeek') === 'true';
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    const db = getDatabase();
    
    // Get time blocks from the database
    const query = `
      SELECT * FROM time_blocks 
      WHERE userId = ? AND isIdealWeek = ?
    `;
    
    const timeBlocks = db.prepare(query).all(userId, isIdealWeek ? 1 : 0) as TimeBlock[];
    
    return NextResponse.json({ timeBlocks });
  } catch (error) {
    console.error('Error fetching time blocks:', error);
    return NextResponse.json({ error: 'Failed to fetch time blocks' }, { status: 500 });
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
          updatedAt INTEGER NOT NULL
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
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          now
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