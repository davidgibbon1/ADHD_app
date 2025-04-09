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
      } catch (error: any) {
        console.error('Error fetching database info from Notion:', error);
        
        // Map the error codes to user-friendly messages
        const errorCode = error.message || 'UNKNOWN_ERROR';
        let status = 500;
        let errorMessage = 'Failed to connect to Notion database';
        
        switch (errorCode) {
          case 'NOTION_API_MISSING_TOKEN':
            status = 500;
            errorMessage = 'Notion API token is not configured';
            break;
          case 'NOTION_INVALID_DATABASE_ID':
          case 'NOTION_MALFORMED_DATABASE_ID':
            status = 400;
            errorMessage = 'The Notion database ID provided is invalid';
            break;
          case 'NOTION_DATABASE_NOT_FOUND':
            status = 404;
            errorMessage = 'The Notion database could not be found. Check if the database ID is correct and you have access to it';
            break;
          case 'NOTION_UNAUTHORIZED_ACCESS':
            status = 403;
            errorMessage = 'You do not have permission to access this Notion database. Make sure your integration has access';
            break;
          case 'NOTION_RATE_LIMITED':
            status = 429;
            errorMessage = 'Rate limit exceeded for Notion API. Please try again later';
            break;
          case 'NOTION_SERVER_ERROR':
            status = 502;
            errorMessage = 'Notion server returned an error. Please try again later';
            break;
          case 'NOTION_NETWORK_ERROR':
            status = 504;
            errorMessage = 'Could not connect to Notion. Please check your internet connection and try again';
            break;
          default:
            status = 500;
            errorMessage = 'An unknown error occurred while connecting to Notion';
        }
        
        return NextResponse.json(
          { 
            error: errorMessage,
            code: errorCode 
          },
          { status }
        );
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
  } catch (error: any) {
    console.error('Error creating database:', error);
    
    // Provide more context in error messages
    let errorMsg = 'Failed to create database';
    let status = 500;
    
    if (error.message && error.message.includes('SQLITE_CONSTRAINT')) {
      errorMsg = 'A database with this information already exists';
      status = 409;
    }
    
    return NextResponse.json(
      { error: errorMsg, details: error.message || 'Unknown error' },
      { status }
    );
  }
}

// PUT to update a Notion database
export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    const { id, name, description, isActive, color } = data;
    
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
    
    // Prepare update object with only the fields that are provided
    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (color !== undefined) updateData.color = color;
    
    // Update the database
    await updateNotionDatabase(id, updateData);
    
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