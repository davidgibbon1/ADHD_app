import { Client } from '@notionhq/client';
import { ExtendedTask } from '@/lib/db/sqliteService';
import { findTaskByNotionId, createTask, updateTask, getAllTasks } from '@/lib/db/sqliteService';
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_AUTH_TOKEN,
});

// Parse database IDs from environment variable
const databaseIds = JSON.parse(process.env.NOTION_DATABASE_IDS || '[]');

interface NotionTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | undefined;
}

export async function fetchNotionTasks(): Promise<NotionTask[]> {
  const allTasks: NotionTask[] = [];
  
  for (const databaseId of databaseIds) {
    try {
      const response = await notion.databases.query({
        database_id: databaseId,
      });
      
      const tasks = response.results
        .filter((page): page is PageObjectResponse => 'properties' in page)
        .map(page => {
          // Extract relevant properties from Notion pages
          // Using type assertions to handle Notion API types
          const nameProperty = page.properties.Name as any;
          const statusProperty = page.properties.Status as any;
          const dateProperty = page.properties.Date as any;
          
          return {
            id: page.id,
            title: nameProperty?.title?.[0]?.plain_text || 'Untitled',
            status: statusProperty?.select?.name || 'To Do',
            dueDate: dateProperty?.date?.start || undefined,
          };
        });
      
      allTasks.push(...tasks);
    } catch (error) {
      console.error(`Error fetching tasks from database ${databaseId}:`, error);
    }
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
        // Map other properties as needed
        tags: ['notion-import']
      }
    };
    return task;
  });
}

// Merge Notion tasks with existing tasks
export async function mergeNotionTasks(userId: string): Promise<{ 
  added: number, 
  updated: number, 
  unchanged: number, 
  total: number 
}> {
  // Fetch tasks from Notion
  const notionTasks = await fetchNotionTasks();
  const appFormattedTasks = convertNotionTasksToAppFormat(notionTasks);
  
  // Track statistics
  let stats = {
    added: 0,
    updated: 0,
    unchanged: 0,
    total: notionTasks.length
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