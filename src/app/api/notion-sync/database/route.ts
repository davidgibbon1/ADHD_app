import { NextRequest, NextResponse } from 'next/server';
import { getNotionDatabaseById, updateLastSynced } from '@/lib/db/notionDatabaseService';
import { mergeDatabaseTasks } from '@/app/services/notionService';
import { getDatabase } from '@/lib/db/sqliteService';

// Helper to get debug info about database contents
async function getDatabaseDebugInfo(databaseId: string) {
  try {
    const db = getDatabase();
    
    // Get task count
    const taskCountStmt = db.prepare(`
      SELECT COUNT(*) as count FROM tasks 
      WHERE notionDatabaseId = ? OR database_id = ? OR source = ?
    `);
    const { count } = taskCountStmt.get(databaseId, databaseId, databaseId) as {count: number};
    
    // Get sample tasks
    const sampleTasksStmt = db.prepare(`
      SELECT * FROM tasks 
      WHERE notionDatabaseId = ? OR database_id = ? OR source = ?
      LIMIT 3
    `);
    const sampleTasks = sampleTasksStmt.all(databaseId, databaseId, databaseId);
    
    return {
      taskCount: count,
      sampleTasks
    };
  } catch (error) {
    console.error("🔄 SYNC-DEBUG: Error getting debug info:", error);
    return { error: "Could not retrieve debug info" };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get request body
    const body = await request.json();
    const { userId, databaseId } = body;

    console.log(`🔄 SYNC: Starting sync for database ${databaseId}, user ${userId}`);
    
    if (!userId || !databaseId) {
      console.error("🔄 SYNC: Missing userId or databaseId in request");
      return NextResponse.json(
        { 
          error: 'Missing required parameters',
          code: 'MISSING_PARAMETERS',
          details: 'Both userId and databaseId are required'
        },
        { status: 400 }
      );
    }

    // Get database from SQLite
    const database = await getNotionDatabaseById(databaseId);
    
    if (!database) {
      console.error(`🔄 SYNC: Database not found with ID ${databaseId}`);
      return NextResponse.json(
        { 
          error: 'Database not found',
          code: 'DATABASE_NOT_FOUND',
          details: `No database found with ID: ${databaseId}`
        },
        { status: 404 }
      );
    }
    
    // Verify database ownership
    if (database.userId !== userId) {
      console.error(`🔄 SYNC: Unauthorized access, database belongs to ${database.userId}, not ${userId}`);
      return NextResponse.json(
        { 
          error: 'Unauthorized access to this database',
          code: 'UNAUTHORIZED_ACCESS',
          details: 'You do not have permission to access this database'
        },
        { status: 403 }
      );
    }
    
    console.log(`🔄 SYNC: Database found: ${database.name}, notionDatabaseId: ${database.notionDatabaseId}`);
    
    // Check if the database has a Notion database ID
    if (!database.notionDatabaseId) {
      console.error(`🔄 SYNC: Database ${databaseId} has no Notion database ID`);
      return NextResponse.json(
        { 
          error: 'This database does not have a Notion ID configured',
          code: 'NOTION_DATABASE_CONFIG_MISSING',
          details: 'You must configure a Notion database ID before syncing'
        },
        { status: 400 }
      );
    }
    
    // Check if the database is active
    if (!database.isActive) {
      console.error(`🔄 SYNC: Database ${databaseId} is not active`);
      return NextResponse.json(
        { 
          error: 'This database is not active. Activate it to sync tasks',
          code: 'DATABASE_INACTIVE',
          details: 'Inactive databases cannot be synced'
        },
        { status: 400 }
      );
    }
    
    // Get debug info before sync
    const beforeSyncInfo = await getDatabaseDebugInfo(databaseId);
    console.log(`🔄 SYNC: Before sync - Task count: ${beforeSyncInfo.taskCount}`);
    
    // Perform sync
    try {
      // Merge tasks from the Notion database
      console.log(`🔄 SYNC: Merging tasks from Notion database ${database.notionDatabaseId} into local database`);
      const result = await mergeDatabaseTasks(userId, databaseId);
      console.log(`🔄 SYNC: Sync completed with results:`, result);
      
      // Get debug info after sync
      const afterSyncInfo = await getDatabaseDebugInfo(databaseId);
      console.log(`🔄 SYNC: After sync - Task count: ${afterSyncInfo.taskCount}`);
      
      if (afterSyncInfo.sampleTasks && afterSyncInfo.sampleTasks.length > 0) {
        console.log(`🔄 SYNC: Sample task after sync:`, afterSyncInfo.sampleTasks[0]);
      }
      
      // Update last synced timestamp
      await updateLastSynced(databaseId);
      console.log(`🔄 SYNC: Updated last synced timestamp for database ${databaseId}`);
      
      return NextResponse.json({
        success: true,
        added: result.added,
        updated: result.updated,
        unchanged: result.unchanged,
        total: result.total,
        databaseName: result.databaseName,
        debug: {
          beforeSync: beforeSyncInfo,
          afterSync: afterSyncInfo
        }
      });
    } catch (syncError: any) {
      console.error('🔄 SYNC: Error syncing database:', syncError);
      
      // Extract the detailed error message if available
      const errorMessage = syncError.message || 'Unknown error';
      const errorCode = errorMessage.split(':')[0];
      const errorDetails = errorMessage.includes(':') ? errorMessage.split(':')[1].trim() : 'Unknown error';
      
      // Handle specific Notion API errors based on error code
      if (errorCode === 'NOTION_DATABASE_NOT_FOUND') {
        return NextResponse.json(
          { 
            error: errorDetails || 'The Notion database could not be found',
            code: errorCode,
            debug: { beforeSync: beforeSyncInfo }
          },
          { status: 404 }
        );
      } else if (errorCode === 'NOTION_UNAUTHORIZED_ACCESS') {
        return NextResponse.json(
          { 
            error: errorDetails || 'You do not have permission to access this Notion database',
            code: errorCode,
            debug: { beforeSync: beforeSyncInfo }
          },
          { status: 403 }
        );
      } else if (errorCode === 'NOTION_DATABASE_CONFIG_MISSING') {
        return NextResponse.json(
          { 
            error: errorDetails || 'The database configuration is incomplete',
            code: errorCode,
            debug: { beforeSync: beforeSyncInfo }
          },
          { status: 400 }
        );
      } else if (errorCode === 'NOTION_RATE_LIMITED') {
        return NextResponse.json(
          { 
            error: errorDetails || 'Rate limit exceeded for Notion API. Please try again later',
            code: errorCode,
            debug: { beforeSync: beforeSyncInfo }
          },
          { status: 429 }
        );
      } else if (errorCode === 'NOTION_API_MISSING_TOKEN') {
        return NextResponse.json(
          { 
            error: errorDetails || 'Notion API token is not configured',
            code: errorCode,
            debug: { beforeSync: beforeSyncInfo }
          },
          { status: 500 }
        );
      } else if (errorCode === 'NOTION_NETWORK_ERROR') {
        return NextResponse.json(
          { 
            error: errorDetails || 'Could not connect to Notion. Please check your internet connection',
            code: errorCode,
            debug: { beforeSync: beforeSyncInfo }
          },
          { status: 503 }
        );
      } else if (errorCode === 'SQLITE_BUSY') {
        return NextResponse.json(
          { 
            error: 'Database is currently busy. Please try again in a moment',
            code: 'DATABASE_LOCKED',
            debug: { beforeSync: beforeSyncInfo }
          },
          { status: 503 }
        );
      } else {
        return NextResponse.json(
          { 
            error: errorDetails || 'Failed to sync tasks from Notion',
            code: errorCode || 'UNKNOWN_ERROR',
            debug: { beforeSync: beforeSyncInfo }
          },
          { status: 500 }
        );
      }
    }
  } catch (error: any) {
    console.error('🔄 SYNC: Error processing sync request:', error);
    
    // Handle SQLite busy errors specifically
    if (error.code === 'SQLITE_BUSY') {
      return NextResponse.json(
        { 
          error: 'Database is currently busy. Please try again in a moment',
          code: 'DATABASE_LOCKED'
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to process sync request',
        details: error.message || 'Unknown error',
        code: error.code || 'UNKNOWN_ERROR'
      },
      { status: 500 }
    );
  }
} 