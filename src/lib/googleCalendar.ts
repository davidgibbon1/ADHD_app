import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { Credentials } from 'google-auth-library';

// Configuration
const config = {
  cached_credentials_file: path.join(process.cwd(), 'token.json')
};

// Interface for calendar events
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  colorId?: string;
  isNew?: boolean;    // Flag to track newly created events
  isTemp?: boolean;   // Flag to track temporary events not yet saved to Google
  isUpdated?: boolean; // Flag to track updated events
}

// Server-side only functions
export async function getAuthUrl() {
  const oAuth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3000/api/auth/google/callback'
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent'
  });

  return authUrl;
}

export async function getCalendarEvents(startDate: Date, endDate: Date, accessToken: string): Promise<CalendarEvent[]> {
  try {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    
    const calendar = google.calendar({ version: 'v3', auth });
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    return response.data.items as CalendarEvent[];
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    throw error;
  }
}

export async function createCalendarEvent(
  summary: string, 
  startDateTime: string, 
  endDateTime: string, 
  description: string = '',
  accessToken: string,
  timeZone: string = 'UTC'
): Promise<CalendarEvent> {
  try {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Format dateTime to RFC3339 format
    const formatToRFC3339 = (dateTimeStr: string, tz: string) => {
      try {
        // Parse the date string
        const date = new Date(dateTimeStr);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid date');
        }
        
        // Format to ISO string with seconds
        // The format will be: YYYY-MM-DDTHH:MM:SS.sssZ
        return date.toISOString();
      } catch (error) {
        console.error('Error formatting date:', error);
        // If parsing fails, try to add seconds if missing
        if (!dateTimeStr.match(/:\d\d$/)) {
          return `${dateTimeStr}:00.000Z`;
        }
        return dateTimeStr.endsWith('Z') ? dateTimeStr : `${dateTimeStr}.000Z`;
      }
    };
    
    const formattedStartDateTime = formatToRFC3339(startDateTime, timeZone);
    const formattedEndDateTime = formatToRFC3339(endDateTime, timeZone);
    
    console.log('Creating event with formatted dates:', {
      startDateTime: formattedStartDateTime,
      endDateTime: formattedEndDateTime,
      timeZone
    });
    
    const event = {
      summary,
      description,
      start: {
        dateTime: formattedStartDateTime,
        timeZone: timeZone,
      },
      end: {
        dateTime: formattedEndDateTime,
        timeZone: timeZone,
      },
    };
    
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });
    
    return response.data as CalendarEvent;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw error;
  }
}

export async function updateCalendarEvent(
  eventId: string,
  updates: Partial<CalendarEvent>,
  accessToken: string
): Promise<CalendarEvent> {
  try {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Format dates if they exist in the updates
    const formattedUpdates = { ...updates };
    
    // Format dateTime to RFC3339 format
    const formatToRFC3339 = (dateTimeStr: string) => {
      try {
        // Parse the date string
        const date = new Date(dateTimeStr);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid date');
        }
        
        // Format to ISO string with seconds
        return date.toISOString();
      } catch (error) {
        console.error('Error formatting date:', error);
        // If parsing fails, try to add seconds if missing
        if (!dateTimeStr.match(/:\d\d$/)) {
          return `${dateTimeStr}:00.000Z`;
        }
        return dateTimeStr.endsWith('Z') ? dateTimeStr : `${dateTimeStr}.000Z`;
      }
    };
    
    if (updates.start?.dateTime) {
      formattedUpdates.start = {
        ...updates.start,
        dateTime: formatToRFC3339(updates.start.dateTime)
      };
    }
    
    if (updates.end?.dateTime) {
      formattedUpdates.end = {
        ...updates.end,
        dateTime: formatToRFC3339(updates.end.dateTime)
      };
    }
    
    console.log('Updating event with formatted dates:', {
      eventId,
      updates: formattedUpdates
    });
    
    const response = await calendar.events.patch({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: formattedUpdates,
    });
    
    return response.data as CalendarEvent;
  } catch (error) {
    console.error('Error updating calendar event:', error);
    throw error;
  }
}

export async function deleteCalendarEvent(eventId: string, accessToken: string): Promise<void> {
  try {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    
    const calendar = google.calendar({ version: 'v3', auth });
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    throw error;
  }
}

// Function to get available calendars
export async function getCalendarList(accessToken: string) {
  try {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    
    const calendar = google.calendar({ version: 'v3', auth });
    
    const response = await calendar.calendarList.list();
    return response.data.items;
  } catch (error) {
    console.error('Error fetching calendar list:', error);
    throw error;
  }
}

// Function to get color definitions for events
export async function getColorDefinitions(accessToken: string) {
  try {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    
    const calendar = google.calendar({ version: 'v3', auth });
    
    const response = await calendar.colors.get();
    return response.data;
  } catch (error) {
    console.error('Error fetching color definitions:', error);
    throw error;
  }
} 