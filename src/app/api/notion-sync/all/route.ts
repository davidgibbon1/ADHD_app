import { NextRequest, NextResponse } from 'next/server';
import { mergeAllNotionTasks } from '@/app/services/notionService';

export const dynamic = 'force-dynamic';

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
    console.error('Error syncing all Notion databases:', error);
    return NextResponse.json(
      { error: 'Failed to sync Notion databases' },
      { status: 500 }
    );
  }
} 