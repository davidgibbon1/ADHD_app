import { NextRequest, NextResponse } from 'next/server';
import { mergeAllNotionTasks, exportTasksToJson } from '@/app/services/notionService';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    const result = await mergeAllNotionTasks(userId);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error syncing Notion tasks:', error);
    return NextResponse.json(
      { error: 'Failed to sync Notion tasks' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    const json = await exportTasksToJson(userId);
    
    return new NextResponse(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="tasks.json"'
      }
    });
  } catch (error) {
    console.error('Error exporting tasks:', error);
    return NextResponse.json(
      { error: 'Failed to export tasks' },
      { status: 500 }
    );
  }
} 