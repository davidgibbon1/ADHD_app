import { getBaseUrl } from '@/lib/utils';
import { CalendarEvent } from '@/lib/types';

export async function fetchCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  const baseUrl = getBaseUrl();
  
  try {
    const response = await fetch(
      `${baseUrl}/api/calendar/events?userId=${encodeURIComponent(userId)}&start=${encodeURIComponent(startDate.toISOString())}&end=${encodeURIComponent(endDate.toISOString())}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch calendar events: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    throw error;
  }
} 