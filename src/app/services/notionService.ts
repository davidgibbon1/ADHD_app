import { Client } from '@notionhq/client';
import { ExtendedTask } from '@/lib/db/sqliteService';
import { findTaskByNotionId, createTask, updateTask, getAllTasks } from '@/lib/db/sqliteService';
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { 
  getAllNotionDatabases, 
  getNotionDatabaseById, 
  updateLastSynced,
  NotionDatabase
} from '@/lib/db/notionDatabaseService';

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
  } catch (error) {
    console.error(`Error fetching database info for ${databaseId}:`, error);
    return { name: 'Unnamed Database', description: '' };
  }
}

// Fetch tasks from a specific Notion database
export async function fetchTasksFromDatabase(database: NotionDatabase): Promise<NotionTask[]> {
  try {
    console.log(`Fetching tasks from Notion database: ${database.name} (${database.notionDatabaseId || 'No Notion ID'})`);
    
    if (!database.notionDatabaseId) {
      console.log('No Notion database ID provided for database:', database.name);
      return [];
    }
    
    const response = await notion.databases.query({
      database_id: database.notionDatabaseId,
    });
    
    console.log(`Received ${response.results.length} results from Notion API`);
    
    const tasks = response.results
      .filter((page): page is PageObjectResponse => 'properties' in page)
      .map(page => {
        // Extract relevant properties from Notion pages
        // Using type assertions to handle Notion API types
        const nameProperty = page.properties.Name as any;
        const statusProperty = page.properties.Status as any;
        const dateProperty = page.properties.Date as any;
        
        const task: NotionTask = {
          id: page.id,
          title: nameProperty?.title?.[0]?.plain_text || 'Untitled',
          status: statusProperty?.select?.name || 'To Do',
          dueDate: dateProperty?.date?.start || undefined,
          databaseId: database.notionDatabaseId as string,
          databaseName: database.name
        };
        
        console.log(`Parsed task: ${task.title}, status: ${task.status}`);
        return task;
      });
    
    console.log(`Returning ${tasks.length} tasks from database ${database.name}`);
    return tasks;
  } catch (error) {
    console.error(`Error fetching tasks from database ${database.name}:`, error);
    return [];
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

// Convert Notion tasks to our app's task format
export function convertNotionTasksToAppFormat(notionTasks: NotionTask[]): Array<Omit<ExtendedTask, 'id'>> {
  return notionTasks.map(notionTask => {
    const task: Omit<ExtendedTask, 'id'> = {
      title: notionTask.title,
      completed: notionTask.status === 'Done' || notionTask.status === 'Completed',
      notionId: notionTask.id,
      source: 'notion',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId: '', // This will be set when merging
      metadata: {
        dueDate: notionTask.dueDate,
        category: notionTask.databaseName, // Use database name as category
        tags: ['notion-import', `notion-db-${notionTask.databaseId.substring(0, 8)}`] // Add database-specific tag
      }
    };
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
  console.log(`Starting merge for database ID: ${databaseId}, user ID: ${userId}`);
  
  // Get the database
  const database = await getNotionDatabaseById(databaseId);
  if (!database) {
    console.error(`Database with ID ${databaseId} not found`);
    throw new Error(`Database with ID ${databaseId} not found`);
  }
  
  console.log(`Found database: ${database.name}`);
  
  // Check if database has a Notion ID
  if (!database.notionDatabaseId) {
    console.log(`Database ${database.name} does not have a Notion database ID`);
    return {
      added: 0,
      updated: 0,
      unchanged: 0,
      total: 0,
      databaseName: database.name
    };
  }
  
  // Fetch tasks from the database
  const notionTasks = await fetchTasksFromDatabase(database);
  console.log(`Fetched ${notionTasks.length} tasks from Notion`);
  
  const appFormattedTasks = convertNotionTasksToAppFormat(notionTasks);
  console.log(`Converted ${appFormattedTasks.length} tasks to app format`);
  
  // Track statistics
  let stats = {
    added: 0,
    updated: 0,
    unchanged: 0,
    total: notionTasks.length,
    databaseName: database.name
  };
  
  // Process each task
  for (const task of appFormattedTasks) {
    // Set the userId for this task
    task.userId = userId;
    
    // Check if task already exists in our database
    const existingTask = await findTaskByNotionId(task.notionId!);
    
    if (!existingTask) {
      // Add new task
      console.log(`Adding new task: ${task.title}`);
      const newTaskId = await createTask(task);
      console.log(`Created new task with ID: ${newTaskId}`);
      stats.added++;
    } else if (existingTask.title !== task.title || existingTask.completed !== task.completed) {
      // Update existing task if it has changed
      console.log(`Updating existing task: ${existingTask.id} (${task.title})`);
      await updateTask(existingTask.id, {
        title: task.title,
        completed: task.completed,
        updatedAt: Date.now()
      });
      stats.updated++;
    } else {
      // Task exists and hasn't changed
      console.log(`Task unchanged: ${existingTask.id} (${task.title})`);
      stats.unchanged++;
    }
  }
  
  // Update the lastSynced timestamp
  await updateLastSynced(database.id);
  
  console.log(`Merge complete. Stats: added=${stats.added}, updated=${stats.updated}, unchanged=${stats.unchanged}, total=${stats.total}`);
  return stats;
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