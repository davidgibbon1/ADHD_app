import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Ensure the data directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'notion_databases.db');

// Interface for Notion database configuration
export interface NotionDatabase {
  id: string;
  userId: string;
  notionDatabaseId: string | null;
  name: string;
  description?: string;
  lastSynced?: number;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

// Initialize database
let db: Database.Database;

// This function ensures we only initialize the database in a server context
export function getNotionDatabasesDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    
    // Create tables if they don't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS notion_databases (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        notionDatabaseId TEXT,
        name TEXT NOT NULL,
        description TEXT,
        lastSynced INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        isActive INTEGER NOT NULL DEFAULT 1
      );
      
      CREATE INDEX IF NOT EXISTS idx_notion_databases_userId ON notion_databases(userId);
    `);
  }
  
  return db;
}

// Get all Notion databases for a user
export async function getAllNotionDatabases(userId: string): Promise<NotionDatabase[]> {
  const db = getNotionDatabasesDb();
  
  const query = `
    SELECT * FROM notion_databases
    WHERE userId = ?
    ORDER BY name ASC
  `;
  
  const rows = db.prepare(query).all(userId) as Array<{
    id: string;
    userId: string;
    notionDatabaseId: string | null;
    name: string;
    description: string | null;
    lastSynced: number | null;
    createdAt: number;
    updatedAt: number;
    isActive: number;
  }>;
  
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    notionDatabaseId: row.notionDatabaseId,
    name: row.name,
    description: row.description || undefined,
    lastSynced: row.lastSynced || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isActive: Boolean(row.isActive)
  }));
}

// Get a specific Notion database by ID
export async function getNotionDatabaseById(id: string): Promise<NotionDatabase | null> {
  const db = getNotionDatabasesDb();
  
  const row = db.prepare(`
    SELECT * FROM notion_databases
    WHERE id = ?
  `).get(id) as {
    id: string;
    userId: string;
    notionDatabaseId: string | null;
    name: string;
    description: string | null;
    lastSynced: number | null;
    createdAt: number;
    updatedAt: number;
    isActive: number;
  } | undefined;
  
  if (!row) return null;
  
  return {
    id: row.id,
    userId: row.userId,
    notionDatabaseId: row.notionDatabaseId,
    name: row.name,
    description: row.description || undefined,
    lastSynced: row.lastSynced || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isActive: Boolean(row.isActive)
  };
}

// Create a new Notion database configuration
export async function createNotionDatabase(database: Omit<NotionDatabase, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const db = getNotionDatabasesDb();
  const id = randomUUID();
  const now = Date.now();
  
  const insertDb = db.prepare(`
    INSERT INTO notion_databases (
      id, userId, notionDatabaseId, name, description, lastSynced, createdAt, updatedAt, isActive
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  insertDb.run(
    id,
    database.userId,
    database.notionDatabaseId,
    database.name,
    database.description || null,
    database.lastSynced || null,
    now,
    now,
    database.isActive ? 1 : 0
  );
  
  return id;
}

// Update a Notion database configuration
export async function updateNotionDatabase(id: string, updates: Partial<Omit<NotionDatabase, 'id' | 'createdAt'>>): Promise<void> {
  const db = getNotionDatabasesDb();
  const now = Date.now();
  
  // Build the SET clause dynamically based on provided updates
  const updateFields: string[] = [];
  const params: any[] = [];
  
  if (updates.userId !== undefined) {
    updateFields.push('userId = ?');
    params.push(updates.userId);
  }
  
  if (updates.notionDatabaseId !== undefined) {
    updateFields.push('notionDatabaseId = ?');
    params.push(updates.notionDatabaseId);
  }
  
  if (updates.name !== undefined) {
    updateFields.push('name = ?');
    params.push(updates.name);
  }
  
  if (updates.description !== undefined) {
    updateFields.push('description = ?');
    params.push(updates.description);
  }
  
  if (updates.lastSynced !== undefined) {
    updateFields.push('lastSynced = ?');
    params.push(updates.lastSynced);
  }
  
  if (updates.isActive !== undefined) {
    updateFields.push('isActive = ?');
    params.push(updates.isActive ? 1 : 0);
  }
  
  // Always update the updatedAt timestamp
  updateFields.push('updatedAt = ?');
  params.push(now);
  
  // Add the ID as the last parameter
  params.push(id);
  
  const updateQuery = `
    UPDATE notion_databases
    SET ${updateFields.join(', ')}
    WHERE id = ?
  `;
  
  db.prepare(updateQuery).run(...params);
}

// Delete a Notion database configuration
export async function deleteNotionDatabase(id: string): Promise<void> {
  const db = getNotionDatabasesDb();
  
  db.prepare('DELETE FROM notion_databases WHERE id = ?').run(id);
}

// Find a Notion database by its Notion database ID
export async function findNotionDatabaseByNotionId(userId: string, notionDatabaseId: string): Promise<NotionDatabase | null> {
  const db = getNotionDatabasesDb();
  
  const row = db.prepare(`
    SELECT * FROM notion_databases
    WHERE userId = ? AND notionDatabaseId = ?
  `).get(userId, notionDatabaseId) as {
    id: string;
    userId: string;
    notionDatabaseId: string | null;
    name: string;
    description: string | null;
    lastSynced: number | null;
    createdAt: number;
    updatedAt: number;
    isActive: number;
  } | undefined;
  
  if (!row) return null;
  
  return {
    id: row.id,
    userId: row.userId,
    notionDatabaseId: row.notionDatabaseId,
    name: row.name,
    description: row.description || undefined,
    lastSynced: row.lastSynced || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isActive: Boolean(row.isActive)
  };
}

// Update the lastSynced timestamp for a database
export async function updateLastSynced(id: string): Promise<void> {
  const db = getNotionDatabasesDb();
  const now = Date.now();
  
  db.prepare(`
    UPDATE notion_databases
    SET lastSynced = ?, updatedAt = ?
    WHERE id = ?
  `).run(now, now, id);
} 