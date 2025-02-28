import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { Task } from '@/lib/types';
import { randomUUID } from 'crypto';

// Extended Task type with Notion-specific fields
export interface ExtendedTask extends Task {
  notionId?: string;
  source?: string;
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
    db = new Database(DB_PATH);
    
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
        source TEXT DEFAULT 'app'
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
  
  const rows = db.prepare(query).all(params);
  
  // Get tags for each task
  const tasks = rows.map((row: any) => {
    const tags = db.prepare('SELECT tag FROM task_tags WHERE taskId = ?').all(row.id).map((t: any) => t.tag);
    
    return {
      id: row.id,
      title: row.title,
      completed: Boolean(row.completed),
      userId: row.userId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      notionId: row.notionId,
      source: row.source,
      metadata: {
        duration: row.duration,
        priority: row.priority as 'low' | 'medium' | 'high' | undefined,
        energy: row.energy as 'low' | 'medium' | 'high' | undefined,
        tags: tags.length > 0 ? tags : undefined,
        dueDate: row.dueDate,
        category: row.category,
        notes: row.notes
      }
    };
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
  `).get(id);
  
  if (!row) return null;
  
  const tags = db.prepare('SELECT tag FROM task_tags WHERE taskId = ?').all(id).map((t: any) => t.tag);
  
  return {
    id: row.id,
    title: row.title,
    completed: Boolean(row.completed),
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    notionId: row.notionId,
    source: row.source,
    metadata: {
      duration: row.duration,
      priority: row.priority as 'low' | 'medium' | 'high' | undefined,
      energy: row.energy as 'low' | 'medium' | 'high' | undefined,
      tags: tags.length > 0 ? tags : undefined,
      dueDate: row.dueDate,
      category: row.category,
      notes: row.notes
    }
  };
}

export async function createTask(task: Omit<ExtendedTask, 'id'> & { id?: string }): Promise<string> {
  const db = getDatabase();
  const id = task.id || randomUUID();
  const now = Date.now();
  
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, title, completed, userId, createdAt, updatedAt, notionId, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  insertTask.run(
    id,
    task.title,
    task.completed ? 1 : 0,
    task.userId || null,
    task.createdAt || now,
    task.updatedAt || now,
    task.notionId || null,
    task.source || 'app'
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
  
  return id;
}

export async function updateTask(id: string, updates: Partial<Omit<ExtendedTask, 'id'>>): Promise<void> {
  const db = getDatabase();
  const now = Date.now();
  
  // Start a transaction
  const transaction = db.transaction(() => {
    // Update task fields
    if (updates.title !== undefined || updates.completed !== undefined) {
      const updateTaskStmt = db.prepare(`
        UPDATE tasks
        SET title = COALESCE(?, title),
            completed = COALESCE(?, completed),
            updatedAt = ?
        WHERE id = ?
      `);
      
      updateTaskStmt.run(
        updates.title,
        updates.completed !== undefined ? (updates.completed ? 1 : 0) : null,
        now,
        id
      );
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
  
  transaction();
}

export async function deleteTask(id: string): Promise<void> {
  const db = getDatabase();
  
  // Start a transaction
  const transaction = db.transaction(() => {
    // Delete from task_tags
    db.prepare('DELETE FROM task_tags WHERE taskId = ?').run(id);
    
    // Delete from task_metadata
    db.prepare('DELETE FROM task_metadata WHERE taskId = ?').run(id);
    
    // Delete from tasks
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  });
  
  transaction();
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
  `).get(notionId);
  
  if (!row) return null;
  
  const tags = db.prepare('SELECT tag FROM task_tags WHERE taskId = ?').all(row.id).map((t: any) => t.tag);
  
  return {
    id: row.id,
    title: row.title,
    completed: Boolean(row.completed),
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    notionId: row.notionId,
    source: row.source,
    metadata: {
      duration: row.duration,
      priority: row.priority as 'low' | 'medium' | 'high' | undefined,
      energy: row.energy as 'low' | 'medium' | 'high' | undefined,
      tags: tags.length > 0 ? tags : undefined,
      dueDate: row.dueDate,
      category: row.category,
      notes: row.notes
    }
  };
} 