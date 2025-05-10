import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/lib/googleCalendar';

export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('google_access_token')?.value;
  
  if (!accessToken) {
    console.error('GET /api/calendar/events: No access token found');
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');
  
  if (!startParam || !endParam) {
    console.error('GET /api/calendar/events: Missing start or end date');
    return NextResponse.json({ error: 'Missing start or end date' }, { status: 400 });
  }
  
  try {
    const startDate = new Date(startParam);
    const endDate = new Date(endParam);
    
    console.log(`Fetching events from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    const events = await getCalendarEvents(startDate, endDate, accessToken);
    console.log(`Successfully fetched ${events.length} events`);
    
    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('Error fetching calendar events:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar events', details: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('google_access_token')?.value;
  
  if (!accessToken) {
    console.error('POST /api/calendar/events: No access token found');
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  
  try {
    const body = await request.json();
    const { summary, startDateTime, endDateTime, description, timeZone } = body;
    
    if (!summary || !startDateTime || !endDateTime) {
      console.error('POST /api/calendar/events: Missing required fields', { summary, startDateTime, endDateTime });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    console.log('Creating calendar event:', { summary, startDateTime, endDateTime, description, timeZone });
    
    const event = await createCalendarEvent(
      summary,
      startDateTime,
      endDateTime,
      description || '',
      accessToken,
      timeZone || 'UTC'
    );
    
    console.log('Event created successfully:', event.id);
    return NextResponse.json({ event });
  } catch (error: any) {
    console.error('Error creating calendar event:', error);
    return NextResponse.json({ 
      error: 'Failed to create calendar event', 
      details: error.message 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('google_access_token')?.value;
  
  if (!accessToken) {
    console.error('PUT /api/calendar/events: No access token found');
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  
  try {
    const body = await request.json();
    const { eventId, updates } = body;
    
    if (!eventId || !updates) {
      console.error('PUT /api/calendar/events: Missing eventId or updates', { eventId, updates });
      return NextResponse.json({ error: 'Missing eventId or updates' }, { status: 400 });
    }
    
    console.log('Updating calendar event:', { eventId, updates });
    
    const event = await updateCalendarEvent(eventId, updates, accessToken);
    console.log('Event updated successfully:', event.id);
    
    return NextResponse.json({ event });
  } catch (error: any) {
    console.error('Error updating calendar event:', error);
    return NextResponse.json({ 
      error: 'Failed to update calendar event', 
      details: error.message 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('google_access_token')?.value;
  
  if (!accessToken) {
    console.error('DELETE /api/calendar/events: No access token found');
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    
    if (!eventId) {
      console.error('DELETE /api/calendar/events: Missing eventId');
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    }
    
    console.log('Deleting calendar event:', eventId);
    
    await deleteCalendarEvent(eventId, accessToken);
    console.log('Event deleted successfully:', eventId);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting calendar event:', error);
    return NextResponse.json({ 
      error: 'Failed to delete calendar event', 
      details: error.message 
    }, { status: 500 });
  }
} 