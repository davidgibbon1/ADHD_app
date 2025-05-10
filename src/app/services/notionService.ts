import { Client } from '@notionhq/client';
import { ExtendedTask } from '@/lib/db/sqliteService';
import { findTaskByNotionId, createTask, updateTask, getAllTasks, getDatabase } from '@/lib/db/sqliteService';
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { 
  getAllNotionDatabases, 
  getNotionDatabaseById, 
  updateLastSynced,
  NotionDatabase
} from '@/lib/db/notionDatabaseService';

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
  
  // Fields from task_metadata (joined)
  duration?: number;
  priority?: 'low' | 'medium' | 'high' | null;
  energy?: 'low' | 'medium' | 'high' | null;
  dueDate?: string | null;
  category?: string | null;
  notes?: string | null;
}

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_AUTH_TOKEN,
});

interface NotionTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | undefined;
  databaseId: string;
  databaseName: string;
}

// Fetch database info from Notion
export async function fetchNotionDatabaseInfo(databaseId: string): Promise<{ name: string; description: string }> {
  try {
    if (!process.env.NOTION_AUTH_TOKEN) {
      throw new Error('NOTION_API_MISSING_TOKEN');
    }

    if (!databaseId || databaseId.trim() === '') {
      throw new Error('NOTION_INVALID_DATABASE_ID');
    }

    // Validate database ID format (basic check)
    const validIdPattern = /^[a-zA-Z0-9-]+$/;
    if (!validIdPattern.test(databaseId)) {
      throw new Error('NOTION_MALFORMED_DATABASE_ID');
    }

    const response = await notion.databases.retrieve({
      database_id: databaseId,
    });
    
    // Extract database name and description
    // Using type assertion to handle Notion API types
    const title = (response as any).title || [];
    const description = (response as any).description || [];
    
    const name = title[0]?.plain_text || 'Unnamed Database';
    const descriptionText = description[0]?.plain_text || '';
    
    return { name, description: descriptionText };
  } catch (error: any) {
    console.error(`Error fetching database info for ${databaseId}:`, error);
    
    // Handle specific Notion API errors
    if (error.code === 'object_not_found') {
      throw new Error('NOTION_DATABASE_NOT_FOUND');
    } else if (error.code === 'unauthorized') {
      throw new Error('NOTION_UNAUTHORIZED_ACCESS');
    } else if (error.code === 'validation_error') {
      throw new Error('NOTION_INVALID_DATABASE_ID');
    } else if (error.code === 'rate_limited') {
      throw new Error('NOTION_RATE_LIMITED');
    } else if (error.message?.includes('NOTION_')) {
      // Re-throw our custom errors
      throw error;
    } else if (error.status === 500) {
      throw new Error('NOTION_SERVER_ERROR');
    } else if (error.message?.includes('fetch failed')) {
      throw new Error('NOTION_NETWORK_ERROR');
    }
    
    // If unknown error, throw a generic error
    throw new Error('NOTION_UNKNOWN_ERROR');
  }
}

// Fetch tasks from a specific Notion database
export async function fetchTasksFromDatabase(database: NotionDatabase): Promise<NotionTask[]> {
  try {
    if (!database.notionDatabaseId) {
      console.log(`Database ${database.name} has no Notion database ID`);
      return [];
    }

    console.log(`Fetching tasks from Notion database: ${database.notionDatabaseId}`);
    
    // Check if Notion API token is set
    if (!process.env.NOTION_AUTH_TOKEN) {
      console.error("NOTION_AUTH_TOKEN is not set in environment variables");
      throw new Error("Notion API token not configured");
    }
    
    try {
      // Query the Notion database
      const response = await notion.databases.query({
        database_id: database.notionDatabaseId,
      });
      
      console.log(`Retrieved ${response.results.length} results from Notion database`);
      
      // Convert Notion pages to tasks
      const tasks: NotionTask[] = [];
      
      for (const page of response.results as PageObjectResponse[]) {
        try {
          // Extract properties from the page
          const properties = page.properties;
          
          // Get task title/name
          let title = 'Untitled Task';
          const titleProp = Object.values(properties).find(
            (prop: any) => prop.type === 'title'
          );
          if (titleProp && titleProp.type === 'title' && titleProp.title.length > 0) {
            title = titleProp.title.map((t: any) => t.plain_text).join('');
          }
          
          // Get task status
          let status = 'Not Started';
          const statusProp = Object.values(properties).find(
            (prop: any) => prop.type === 'status' || prop.type === 'select'
          );
          if (statusProp) {
            if (statusProp.type === 'status' && statusProp.status) {
              status = statusProp.status.name;
            } else if (statusProp.type === 'select' && statusProp.select) {
              status = statusProp.select.name;
            }
          }
          
          // Get due date
          let dueDate: string | undefined = undefined;
          const dateProp = Object.values(properties).find(
            (prop: any) => prop.type === 'date'
          );
          if (dateProp && dateProp.type === 'date' && dateProp.date) {
            dueDate = dateProp.date.start;
          }
          
          // Add task to the list
          tasks.push({
            id: page.id,
            title,
            status,
            dueDate,
            databaseId: database.notionDatabaseId,
            databaseName: database.name,
          });
          
          console.log(`Added task: ${title} (status: ${status})`);
        } catch (err) {
          console.error('Error processing Notion page:', err);
          // Continue with next page
        }
      }
      
      console.log(`Found ${tasks.length} tasks in database ${database.name}`);
      return tasks;
    } catch (notionError: any) {
      // Handle specific Notion API errors
      if (notionError.code === 'object_not_found') {
        console.error(`Notion database not found: ${database.notionDatabaseId}`);
        throw new Error(`Notion database not found: ${database.notionDatabaseId}`);
      } else if (notionError.code === 'unauthorized') {
        console.error(`Unauthorized access to Notion database: ${database.notionDatabaseId}`);
        throw new Error(`Unauthorized access to Notion database: ${database.notionDatabaseId}`);
      } else if (notionError.status === 429) {
        console.error('Rate limited by Notion API');
        throw new Error('Rate limited by Notion API');
      }
      
      // Rethrow with more context
      console.error(`Error querying Notion database: ${notionError.message}`);
      throw new Error(`Error querying Notion database: ${notionError.message}`);
    }
  } catch (error) {
    console.error(`Error fetching tasks from Notion database ${database.notionDatabaseId}:`, error);
    throw error;
  }
}

// Fetch tasks from all active Notion databases for a user
export async function fetchAllNotionTasks(userId: string): Promise<NotionTask[]> {
  const allTasks: NotionTask[] = [];
  
  // Get all active databases for the user
  const databases = await getAllNotionDatabases(userId);
  const activeDatabases = databases.filter(db => db.isActive);
  
  // Fetch tasks from each active database
  for (const database of activeDatabases) {
    const tasks = await fetchTasksFromDatabase(database);
    allTasks.push(...tasks);
    
    // Update the lastSynced timestamp
    await updateLastSynced(database.id);
  }
  
  return allTasks;
}

// Convert Notion tasks to app format
export function convertNotionTasksToAppFormat(notionTasks: NotionTask[]): Array<Omit<ExtendedTask, 'id'>> {
  return notionTasks.map(notionTask => {
    // Determine if task is completed based on status
    const isCompleted = 
      notionTask.status === 'Done' || 
      notionTask.status === 'Completed' || 
      notionTask.status === 'Complete';
    
    // Log the database ID to help debug
    console.log(`Converting Notion task: ${notionTask.title}, database ID: ${notionTask.databaseId}`);
    
    // Create task object for our app with guaranteed metadata
    const task: Omit<ExtendedTask, 'id'> = {
      title: notionTask.title,
      completed: isCompleted,
      notionId: notionTask.id,
      notionDatabaseId: notionTask.databaseId,
      source: 'notion',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId: '', // This will be set when merging
      metadata: {
        dueDate: notionTask.dueDate,
        category: notionTask.status, // Use Notion status as category
        tags: [
          'notion-import', 
          `notion-status-${notionTask.status.toLowerCase().replace(/\s+/g, '-')}` // Add status as tag
        ],
        notes: `Database: ${notionTask.databaseName || 'Unknown'}\nNotion ID: ${notionTask.id}`,
      }
    };
    
    // Add priority if we can determine it from the task name
    if (task.metadata && notionTask.title.match(/\[high\]/i)) {
      task.metadata.priority = 'high';
    } else if (task.metadata && notionTask.title.match(/\[medium\]/i)) {
      task.metadata.priority = 'medium';
    } else if (task.metadata && notionTask.title.match(/\[low\]/i)) {
      task.metadata.priority = 'low';
    }
    
    return task;
  });
}

// Merge Notion tasks with existing tasks for a specific database
export async function mergeDatabaseTasks(userId: string, databaseId: string): Promise<{ 
  added: number, 
  updated: number, 
  unchanged: number, 
  total: number,
  databaseName: string
}> {
  try {
    console.log(`🔄 MERGE: Starting merge for database ${databaseId}, user ${userId}`);
    
    // Get the database from storage
    const database = await getNotionDatabaseById(databaseId);
    if (!database) {
      console.error(`🔄 MERGE: Database not found: ${databaseId}`);
      throw new Error(`Database not found: ${databaseId}`);
    }
    
    console.log(`🔄 MERGE: Got database: ${database.name}, notionDatabaseId: ${database.notionDatabaseId || 'none'}`);
    
    if (!database.notionDatabaseId) {
      console.error(`🔄 MERGE: Database has no Notion database ID: ${databaseId}`);
      throw new Error(`Database has no Notion database ID: ${databaseId}`);
    }

    // Fetch tasks from Notion
    let notionTasks: NotionTask[] = [];
    console.log(`🔄 MERGE: Fetching tasks from Notion for database ${database.name} (${database.notionDatabaseId})`);
    try {
      notionTasks = await fetchTasksFromDatabase(database);
      console.log(`🔄 MERGE: Fetched ${notionTasks.length} tasks from Notion`);
    } catch (error) {
      console.error(`🔄 MERGE: Error fetching tasks from Notion:`, error);
      throw error;
    }

    // Convert to app task format
    const appTasks = convertNotionTasksToAppFormat(notionTasks);
    console.log(`🔄 MERGE: Converted ${appTasks.length} tasks to app format`);

    // Get existing tasks from SQLite DB
    const db = getDatabase();
    console.log(`🔄 MERGE: Fetching existing tasks from local database for databaseId ${database.id} or notionDatabaseId ${database.notionDatabaseId}`);
    
    // Modified query to check multiple database ID fields
    const stmt = db.prepare(`
      SELECT * FROM tasks 
      WHERE 
        (notionDatabaseId = ? OR 
         notionDatabaseId = ? OR 
         source = ?)
    `);
    
    // Pass all database identifiers to try different formats
    const existingRows = stmt.all(database.notionDatabaseId, database.id, database.id) as TaskRow[];
    console.log(`🔄 MERGE: Found ${existingRows.length} existing tasks in local database`);

    // Organize existing tasks by their Notion ID for quick lookup
    const existingTasksByNotionId = new Map<string, TaskRow>();
    for (const row of existingRows) {
      if (row.notionId) {
        existingTasksByNotionId.set(row.notionId, row);
      }
    }
    console.log(`🔄 MERGE: Mapped ${existingTasksByNotionId.size} existing tasks by Notion ID`);

    let added = 0;
    let updated = 0;
    let unchanged = 0;

    // Process each task
    for (const task of appTasks) {
      try {
        // Check if task already exists
        const existingTask = task.notionId ? existingTasksByNotionId.get(task.notionId) : undefined;
        
        // Ensure database IDs are set correctly
        task.notionDatabaseId = database.notionDatabaseId;
        task.source = database.id;
        task.userId = userId;
        
        if (existingTask) {
          // Check if task needs updating
          if (
            existingTask.title !== task.title || 
            Boolean(existingTask.completed) !== task.completed
          ) {
            console.log(`🔄 MERGE: Updating task ${task.notionId}: ${task.title}`);
            await updateTask(existingTask.id, task);
            updated++;
          } else {
            console.log(`🔄 MERGE: Task unchanged ${task.notionId}: ${task.title}`);
            unchanged++;
          }
        } else {
          // Add new task
          console.log(`🔄 MERGE: Adding new task: ${task.title}, with notionId: ${task.notionId}`);
          await createTask(task);
          added++;
        }
      } catch (taskError) {
        console.error(`🔄 MERGE: Error processing task ${task.title}:`, taskError);
        // Continue with other tasks even if one fails
      }
    }

    // Update last synced timestamp
    try {
      await updateLastSynced(databaseId);
      console.log(`🔄 MERGE: Updated last synced timestamp for database ${databaseId}`);
    } catch (timestampError) {
      console.error(`🔄 MERGE: Error updating last synced timestamp:`, timestampError);
      // Continue anyway
    }

    console.log(`🔄 MERGE: Completed merge for database ${database.name}. Added: ${added}, Updated: ${updated}, Unchanged: ${unchanged}`);
    
    return {
      added,
      updated,
      unchanged,
      total: added + updated + unchanged,
      databaseName: database.name
    };
  } catch (error) {
    console.error(`🔄 MERGE: Error in mergeDatabaseTasks:`, error);
    throw error;
  }
}

// Merge tasks from all active Notion databases
export async function mergeAllNotionTasks(userId: string): Promise<{ 
  added: number, 
  updated: number, 
  unchanged: number, 
  total: number,
  databases: number
}> {
  // Fetch tasks from all active databases
  const notionTasks = await fetchAllNotionTasks(userId);
  const appFormattedTasks = convertNotionTasksToAppFormat(notionTasks);
  
  // Get all active databases
  const databases = await getAllNotionDatabases(userId);
  const activeDatabases = databases.filter(db => db.isActive);
  
  // Track statistics
  let stats = {
    added: 0,
    updated: 0,
    unchanged: 0,
    total: notionTasks.length,
    databases: activeDatabases.length
  };
  
  // Process each task
  for (const task of appFormattedTasks) {
    // Set the userId for this task
    task.userId = userId;
    
    // Check if task already exists in our database
    const existingTask = await findTaskByNotionId(task.notionId!);
    
    if (!existingTask) {
      // Add new task
      await createTask(task);
      stats.added++;
    } else if (existingTask.title !== task.title || existingTask.completed !== task.completed) {
      // Update existing task if it has changed
      await updateTask(existingTask.id, {
        title: task.title,
        completed: task.completed,
        updatedAt: Date.now()
      });
      stats.updated++;
    } else {
      // Task exists and hasn't changed
      stats.unchanged++;
    }
  }
  
  return stats;
}

// Export tasks to a downloadable format (JSON)
export async function exportTasksToJson(userId: string): Promise<string> {
  const tasks = await getAllTasks(userId);
  return JSON.stringify(tasks, null, 2);
} 