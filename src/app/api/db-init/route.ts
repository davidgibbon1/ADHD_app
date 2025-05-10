import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/sqliteService';

export async function GET() {
  try {
    // Initialize the database
    const db = getDatabase();
    
    return NextResponse.json({ 
      status: 'success', 
      message: 'Database initialized successfully' 
    });
  } catch (error) {
    console.error('Error initializing database:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Failed to initialize database',
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 