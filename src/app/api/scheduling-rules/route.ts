import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/sqliteService';
import { getNotionDatabasesDb } from '@/lib/db/notionDatabaseService';
import { getDefaultRules, SchedulingRules } from '@/app/services/schedulingService';

// Define interface for database row
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

// Initialize database
function initializeDatabase() {
  // Initialize main tasks database
  const db = getDatabase();
  
  // Create scheduling_rules table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduling_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      maxTaskDuration INTEGER NOT NULL,
      maxLongTaskDuration INTEGER NOT NULL,
      longTaskThreshold INTEGER NOT NULL,
      priorityWeight REAL NOT NULL,
      timeWeight REAL NOT NULL,
      randomnessFactor REAL NOT NULL,
      workingDays TEXT NOT NULL,
      timeBlocks TEXT NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_scheduling_rules_userId ON scheduling_rules(userId);
  `);
  
  // Also ensure Notion databases are initialized (this is synchronous too)
  getNotionDatabasesDb();
  
  return db;
}

export async function GET(request: NextRequest) {
  try {
    // Initialize database
    const db = initializeDatabase();
    
    // Get userId from query params
    const userId = request.nextUrl.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    // Check if user has scheduling rules
    const stmt = db.prepare('SELECT * FROM scheduling_rules WHERE userId = ? ORDER BY id DESC LIMIT 1');
    const userRules = stmt.get(userId) as SchedulingRulesRow | undefined;
    
    if (userRules) {
      // Convert stored JSON strings to objects
      const rules: SchedulingRules = {
        maxTaskDuration: userRules.maxTaskDuration,
        maxLongTaskDuration: userRules.maxLongTaskDuration,
        longTaskThreshold: userRules.longTaskThreshold,
        priorityWeight: userRules.priorityWeight,
        timeWeight: userRules.timeWeight,
        randomnessFactor: userRules.randomnessFactor,
        workingDays: JSON.parse(userRules.workingDays),
        timeBlocks: JSON.parse(userRules.timeBlocks)
      };
      
      return NextResponse.json(rules);
    } else {
      // Return default rules if user has none
      return NextResponse.json(getDefaultRules());
    }
  } catch (error) {
    console.error('Error fetching scheduling rules:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduling rules' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Initialize database
    const db = initializeDatabase();
    
    // Parse request body
    const data = await request.json();
    const { userId, ...ruleData } = data;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    // Prepare insert statement with named parameters
    const insertStmt = db.prepare(`
      INSERT INTO scheduling_rules (
        userId,
        maxTaskDuration,
        maxLongTaskDuration,
        longTaskThreshold,
        priorityWeight,
        timeWeight,
        randomnessFactor,
        workingDays,
        timeBlocks
      ) VALUES (
        @userId,
        @maxTaskDuration,
        @maxLongTaskDuration,
        @longTaskThreshold,
        @priorityWeight,
        @timeWeight,
        @randomnessFactor,
        @workingDays,
        @timeBlocks
      )
    `);
    
    // Convert non-primitive values to JSON strings
    const params = {
      userId,
      maxTaskDuration: ruleData.maxTaskDuration || 60,
      maxLongTaskDuration: ruleData.maxLongTaskDuration || 120,
      longTaskThreshold: ruleData.longTaskThreshold || 90,
      priorityWeight: ruleData.priorityWeight || 0.6,
      timeWeight: ruleData.timeWeight || 0.4,
      randomnessFactor: ruleData.randomnessFactor || 0.2,
      workingDays: JSON.stringify(ruleData.workingDays || getDefaultRules().workingDays),
      timeBlocks: JSON.stringify(ruleData.timeBlocks || getDefaultRules().timeBlocks)
    };
    
    // Execute the insert
    insertStmt.run(params);
    
    // Get the newly inserted rule
    const rule = db.prepare('SELECT * FROM scheduling_rules WHERE userId = ? ORDER BY id DESC LIMIT 1').get(userId) as SchedulingRulesRow;
    
    // Convert stored JSON strings to objects for response
    const schedulingRules: SchedulingRules = {
      maxTaskDuration: rule.maxTaskDuration,
      maxLongTaskDuration: rule.maxLongTaskDuration,
      longTaskThreshold: rule.longTaskThreshold,
      priorityWeight: rule.priorityWeight,
      timeWeight: rule.timeWeight,
      randomnessFactor: rule.randomnessFactor,
      workingDays: JSON.parse(rule.workingDays),
      timeBlocks: JSON.parse(rule.timeBlocks)
    };
    
    return NextResponse.json(schedulingRules);
  } catch (error) {
    console.error('Error creating scheduling rule:', error);
    return NextResponse.json(
      { error: 'Failed to create scheduling rule' },
      { status: 500 }
    );
  }
} 