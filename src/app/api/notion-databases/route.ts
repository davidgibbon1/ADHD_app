import { NextRequest, NextResponse } from 'next/server';
import { 
  getAllNotionDatabases, 
  createNotionDatabase, 
  updateNotionDatabase, 
  deleteNotionDatabase,
  getNotionDatabaseById
} from '@/lib/db/notionDatabaseService';
import { fetchNotionDatabaseInfo } from '@/app/services/notionService';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// GET all Notion databases for a user
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    const databases = await getAllNotionDatabases(userId);
    
    return NextResponse.json(databases);
  } catch (error) {
    console.error('Error fetching Notion databases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Notion databases' },
      { status: 500 }
    );
  }
}

// POST a new Notion database
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { userId, notionDatabaseId, name, description } = data;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    // Name is required
    if (!name) {
      return NextResponse.json(
        { error: 'Database name is required' },
        { status: 400 }
      );
    }
    
    let dbName = name;
    let dbDescription = description || '';
    
    // If Notion database ID is provided and not empty, fetch info from Notion
    if (notionDatabaseId && notionDatabaseId.trim() !== '') {
      try {
        const dbInfo = await fetchNotionDatabaseInfo(notionDatabaseId);
        // Only use Notion name if no name was provided
        if (!name) {
          dbName = dbInfo.name;
        }
        // Only use Notion description if no description was provided
        if (!description) {
          dbDescription = dbInfo.description;
        }
      } catch (error) {
        console.error('Error fetching database info from Notion:', error);
        // Continue with user-provided name
      }
    }
    
    // Create the database with null for empty notionDatabaseId
    const id = await createNotionDatabase({
      userId,
      notionDatabaseId: notionDatabaseId && notionDatabaseId.trim() !== '' ? notionDatabaseId : null,
      name: dbName,
      description: dbDescription,
      isActive: true
    });
    
    const newDatabase = await getNotionDatabaseById(id);
    
    return NextResponse.json(newDatabase, { status: 201 });
  } catch (error) {
    console.error('Error creating database:', error);
    return NextResponse.json(
      { error: 'Failed to create database' },
      { status: 500 }
    );
  }
}

// PUT to update a Notion database
export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    const { id, name, description, isActive } = data;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Database ID is required' },
        { status: 400 }
      );
    }
    
    // Check if database exists
    const existingDb = await getNotionDatabaseById(id);
    if (!existingDb) {
      return NextResponse.json(
        { error: 'Database not found' },
        { status: 404 }
      );
    }
    
    // Update the database
    await updateNotionDatabase(id, {
      name,
      description,
      isActive
    });
    
    // Get the updated database
    const updatedDb = await getNotionDatabaseById(id);
    
    return NextResponse.json(updatedDb);
  } catch (error) {
    console.error('Error updating Notion database:', error);
    return NextResponse.json(
      { error: 'Failed to update Notion database' },
      { status: 500 }
    );
  }
}

// DELETE a Notion database
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'Database ID is required' },
        { status: 400 }
      );
    }
    
    // Check if database exists
    const existingDb = await getNotionDatabaseById(id);
    if (!existingDb) {
      return NextResponse.json(
        { error: 'Database not found' },
        { status: 404 }
      );
    }
    
    // Delete the database
    await deleteNotionDatabase(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting Notion database:', error);
    return NextResponse.json(
      { error: 'Failed to delete Notion database' },
      { status: 500 }
    );
  }
} 