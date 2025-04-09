import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { Task } from '@/lib/types';
import { randomUUID } from 'crypto';

// Extended Task type with Notion-specific fields
export interface ExtendedTask extends Task {
  notionId?: string;
  notionDatabaseId?: string;
  source?: string;
  database_id?: string; // Local database ID (for non-Notion databases)
}

// For the local DB row shape
interface TaskRow {
  // Fields from the tasks table
  id: string;
  title: string;
  completed: number;  // 0 or 1 in DB
  userId?: string;
  createdAt?: number;
  updatedAt?: number;
  notionId?: string;
  notionDatabaseId?: string;
  source?: string;
  database_id?: string; // New field for local database ID
  
  // Fields from task_metadata (joined)
  duration?: number;
  priority?: 'low' | 'medium' | 'high' | null;
  energy?: 'low' | 'medium' | 'high' | null;
  dueDate?: string | null;
  category?: string | null;
  notes?: string | null;
}

// For the tag rows
interface TagRow {
  tag: string;
}

// Ensure the data directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'tasks.db');

// Initialize database
let db: Database.Database;

// This function ensures we only initialize the database in a server context
export function getDatabase(): Database.Database {
  if (!db) {
    // Initialize with configuration for better concurrency handling
    db = new Database(DB_PATH, {
      // Set a longer busy timeout (5 seconds) to wait for locks to be released
      timeout: 5000,
      // Enable verbose mode for better debugging in development
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
    });
    
    // Enable WAL (Write-Ahead Logging) mode for better concurrency
    db.pragma('journal_mode = WAL');
    
    // Set busy timeout to wait instead of failing immediately
    db.pragma('busy_timeout = 5000');
    
    // Create tables if they don't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        userId TEXT,
        createdAt INTEGER,
        updatedAt INTEGER,
        notionId TEXT,
        source TEXT DEFAULT 'app',
        notionDatabaseId TEXT,
        database_id TEXT
      );
      
      CREATE TABLE IF NOT EXISTS task_metadata (
        taskId TEXT PRIMARY KEY,
        duration INTEGER,
        priority TEXT,
        energy TEXT,
        dueDate TEXT,
        category TEXT,
        notes TEXT,
        FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS task_tags (
        taskId TEXT,
        tag TEXT,
        PRIMARY KEY (taskId, tag),
        FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
      );
    `);
    
    // Check if columns exist before adding them
    const columns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{name: string}>;
    const hasNotionDatabaseId = columns.some(col => col.name === 'notionDatabaseId');
    const hasDatabaseId = columns.some(col => col.name === 'database_id');
    
    if (!hasNotionDatabaseId) {
      console.log('Adding notionDatabaseId column to tasks table');
      db.exec('ALTER TABLE tasks ADD COLUMN notionDatabaseId TEXT;');
    }
    
    if (!hasDatabaseId) {
      console.log('Adding database_id column to tasks table');
      db.exec('ALTER TABLE tasks ADD COLUMN database_id TEXT;');
    }
  }
  
  return db;
}

// Task operations
export async function getAllTasks(userId?: string): Promise<ExtendedTask[]> {
  const db = getDatabase();
  
  let query = `
    SELECT 
      t.*,
      m.duration, m.priority, m.energy, m.dueDate, m.category, m.notes
    FROM tasks t
    LEFT JOIN task_metadata m ON t.id = m.taskId
  `;
  
  const params: any[] = [];
  
  if (userId) {
    query += ' WHERE t.userId = ?';
    params.push(userId);
  }
  
  const rows = db.prepare(query).all(params) as TaskRow[];
  
  // Get tags for each task
  const tasks = rows.map((row) => {
    const tagRows = db.prepare('SELECT tag FROM task_tags WHERE taskId = ?')
      .all(row.id) as TagRow[];
    const tags = tagRows.map(tr => tr.tag);
    
    return {
      id: row.id,
      title: row.title,
      completed: Boolean(row.completed),
      userId: row.userId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      notionId: row.notionId,
      notionDatabaseId: row.notionDatabaseId,
      source: row.source,
      database_id: row.database_id,
      metadata: {
        duration: row.duration ?? undefined,
        priority: row.priority ?? undefined,
        energy: row.energy ?? undefined,
        tags: tags.length > 0 ? tags : undefined,
        dueDate: row.dueDate ?? undefined,
        category: row.category ?? undefined,
        notes: row.notes ?? undefined
      }
    } as ExtendedTask;
  });
  
  return tasks;
}

export async function getTaskById(id: string): Promise<ExtendedTask | null> {
  const db = getDatabase();
  
  const row = db.prepare(`
    SELECT 
      t.*,
      m.duration, m.priority, m.energy, m.dueDate, m.category, m.notes
    FROM tasks t
    LEFT JOIN task_metadata m ON t.id = m.taskId
    WHERE t.id = ?
  `).get(id) as TaskRow | undefined;
  
  if (!row) return null;
  
  const tagRows = db.prepare('SELECT tag FROM task_tags WHERE taskId = ?')
    .all(id) as TagRow[];
  const tags = tagRows.map(tr => tr.tag);
  
  return {
    id: row.id,
    title: row.title,
    completed: Boolean(row.completed),
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    notionId: row.notionId,
    notionDatabaseId: row.notionDatabaseId,
    source: row.source,
    database_id: row.database_id,
    metadata: {
      duration: row.duration ?? undefined,
      priority: row.priority ?? undefined,
      energy: row.energy ?? undefined,
      tags: tags.length > 0 ? tags : undefined,
      dueDate: row.dueDate ?? undefined,
      category: row.category ?? undefined,
      notes: row.notes ?? undefined
    }
  } as ExtendedTask;
}

export async function createTask(task: Omit<ExtendedTask, 'id'> & { id?: string }): Promise<string> {
  const db = getDatabase();
  const id = task.id || randomUUID();
  const now = Date.now();
  
  try {
    await retryOperation(() => {
      // Create a transaction for the entire operation
      const transaction = db.transaction(() => {
        const insertTask = db.prepare(`
          INSERT INTO tasks (id, title, completed, userId, createdAt, updatedAt, notionId, notionDatabaseId, source, database_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        insertTask.run(
          id,
          task.title,
          task.completed ? 1 : 0,
          task.userId || null,
          task.createdAt || now,
          task.updatedAt || now,
          task.notionId || null,
          task.notionDatabaseId || null,
          task.source || 'app',
          task.database_id || null
        );
        
        // Insert metadata if present
        if (task.metadata) {
          const insertMetadata = db.prepare(`
            INSERT INTO task_metadata (taskId, duration, priority, energy, dueDate, category, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          
          insertMetadata.run(
            id,
            task.metadata.duration || null,
            task.metadata.priority || null,
            task.metadata.energy || null,
            task.metadata.dueDate || null,
            task.metadata.category || null,
            task.metadata.notes || null
          );
          
          // Insert tags if present
          if (task.metadata.tags && task.metadata.tags.length > 0) {
            const insertTag = db.prepare('INSERT INTO task_tags (taskId, tag) VALUES (?, ?)');
            
            for (const tag of task.metadata.tags) {
              insertTag.run(id, tag);
            }
          }
        }
      });
      
      // Execute the transaction
      return transaction();
    });
    
    return id;
  } catch (error) {
    console.error(`Error creating task:`, error);
    throw error;
  }
}

// Utility function to retry operations that might fail due to db locks
async function retryOperation<T>(operation: () => T, maxRetries = 3, delay = 500): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return operation();
    } catch (error: any) {
      lastError = error;
      
      // Only retry if it's a database lock error
      if (error.code === 'SQLITE_BUSY') {
        console.warn(`Database locked (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        // Increase delay for next retry
        delay *= 1.5;
      } else {
        // For other errors, don't retry
        throw error;
      }
    }
  }
  
  // If we've used all retries
  console.error(`Failed after ${maxRetries} retries:`, lastError);
  throw lastError;
}

export async function updateTask(id: string, updates: Partial<Omit<ExtendedTask, 'id'>>): Promise<void> {
  const db = getDatabase();
  
  try {
    await retryOperation(() => {
      // Start a transaction for the updates
      const transaction = db.transaction(() => {
        // Build task table updates
        const fields: string[] = [];
        const values: any[] = [];
        
        if (updates.title !== undefined) {
          fields.push('title = ?');
          values.push(updates.title);
        }
        
        if (updates.completed !== undefined) {
          fields.push('completed = ?');
          values.push(updates.completed ? 1 : 0);
        }
        
        if (updates.notionId !== undefined) {
          fields.push('notionId = ?');
          values.push(updates.notionId);
        }
        
        if (updates.notionDatabaseId !== undefined) {
          fields.push('notionDatabaseId = ?');
          values.push(updates.notionDatabaseId);
        }
        
        if (updates.source !== undefined) {
          fields.push('source = ?');
          values.push(updates.source);
        }
        
        if (updates.database_id !== undefined) {
          fields.push('database_id = ?');
          values.push(updates.database_id);
        }
        
        // Always update the updatedAt timestamp
        fields.push('updatedAt = ?');
        values.push(Date.now());
        
        // If we have task table updates, execute them
        if (fields.length > 0) {
          const updateQuery = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`;
          values.push(id);
          
          db.prepare(updateQuery).run(...values);
        }
        
        // Update metadata if present
        if (updates.metadata) {
          // Check if metadata exists for this task
          const metadataExists = db.prepare('SELECT 1 FROM task_metadata WHERE taskId = ?').get(id);
          
          if (metadataExists) {
            // Update existing metadata
            const updateMetadataStmt = db.prepare(`
              UPDATE task_metadata
              SET duration = COALESCE(?, duration),
                  priority = COALESCE(?, priority),
                  energy = COALESCE(?, energy),
                  dueDate = COALESCE(?, dueDate),
                  category = COALESCE(?, category),
                  notes = COALESCE(?, notes)
              WHERE taskId = ?
            `);
            
            updateMetadataStmt.run(
              updates.metadata.duration || null,
              updates.metadata.priority || null,
              updates.metadata.energy || null,
              updates.metadata.dueDate || null,
              updates.metadata.category || null,
              updates.metadata.notes || null,
              id
            );
          } else {
            // Insert new metadata
            const insertMetadataStmt = db.prepare(`
              INSERT INTO task_metadata (taskId, duration, priority, energy, dueDate, category, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            insertMetadataStmt.run(
              id,
              updates.metadata.duration || null,
              updates.metadata.priority || null,
              updates.metadata.energy || null,
              updates.metadata.dueDate || null,
              updates.metadata.category || null,
              updates.metadata.notes || null
            );
          }
          
          // Update tags if present
          if (updates.metadata.tags) {
            // Delete existing tags
            db.prepare('DELETE FROM task_tags WHERE taskId = ?').run(id);
            
            // Insert new tags
            if (updates.metadata.tags.length > 0) {
              const insertTagStmt = db.prepare('INSERT INTO task_tags (taskId, tag) VALUES (?, ?)');
              
              for (const tag of updates.metadata.tags) {
                insertTagStmt.run(id, tag);
              }
            }
          }
        }
      });
      
      // Execute the transaction
      return transaction();
    });
  } catch (error) {
    console.error(`Error updating task ${id}:`, error);
    throw error;
  }
}

export async function deleteTask(id: string): Promise<void> {
  const db = getDatabase();
  
  try {
    await retryOperation(() => {
      // Start a transaction
      const transaction = db.transaction(() => {
        try {
          // First check if the task exists
          const taskExists = db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(id);
          if (!taskExists) {
            console.log(`Task ${id} not found, nothing to delete`);
            return; // Early return if task doesn't exist
          }
          
          console.log(`Deleting task_tags for taskId: ${id}`);
          // Delete from task_tags
          db.prepare('DELETE FROM task_tags WHERE taskId = ?').run(id);
          
          console.log(`Deleting task_metadata for taskId: ${id}`);
          // Delete from task_metadata
          db.prepare('DELETE FROM task_metadata WHERE taskId = ?').run(id);
          
          console.log(`Deleting tasks entry for id: ${id}`);
          // Delete from tasks
          db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
          
          console.log(`All delete operations completed for task ${id}`);
        } catch (innerError) {
          console.error(`Error inside transaction for task ${id}:`, innerError);
          throw innerError; // Re-throw to rollback the transaction
        }
      });
      
      // Execute the transaction
      return transaction();
    });
    
    console.log(`Transaction completed successfully for deleting task ${id}`);
  } catch (error) {
    console.error(`Failed to delete task ${id}:`, error);
    throw error; // Re-throw to handle at the API level
  }
}

export async function findTaskByNotionId(notionId: string): Promise<ExtendedTask | null> {
  const db = getDatabase();
  
  const row = db.prepare(`
    SELECT 
      t.*,
      m.duration, m.priority, m.energy, m.dueDate, m.category, m.notes
    FROM tasks t
    LEFT JOIN task_metadata m ON t.id = m.taskId
    WHERE t.notionId = ?
  `).get(notionId) as TaskRow | undefined;
  
  if (!row) return null;
  
  const tagRows = db.prepare('SELECT tag FROM task_tags WHERE taskId = ?')
    .all(row.id) as TagRow[];
  const tags = tagRows.map(tr => tr.tag);
  
  return {
    id: row.id,
    title: row.title,
    completed: Boolean(row.completed),
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    notionId: row.notionId,
    notionDatabaseId: row.notionDatabaseId,
    source: row.source,
    database_id: row.database_id,
    metadata: {
      duration: row.duration ?? undefined,
      priority: row.priority ?? undefined,
      energy: row.energy ?? undefined,
      tags: tags.length > 0 ? tags : undefined,
      dueDate: row.dueDate ?? undefined,
      category: row.category ?? undefined,
      notes: row.notes ?? undefined
    }
  } as ExtendedTask;
} 