import { NextRequest, NextResponse } from 'next/server';
import { mergeDatabaseTasks } from '@/app/services/notionService';

export async function POST(request: NextRequest) {
  try {
    const { userId, databaseId } = await request.json();
    
    if (!userId || !databaseId) {
      return NextResponse.json(
        { error: 'User ID and Database ID are required' },
        { status: 400 }
      );
    }
    
    const result = await mergeDatabaseTasks(userId, databaseId);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error syncing Notion database:', error);
    return NextResponse.json(
      { error: 'Failed to sync Notion database', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 