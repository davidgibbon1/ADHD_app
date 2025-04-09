export interface Task {
  id: string;
  title: string;
  completed: boolean;
  userId: string;
  createdAt: number;
  updatedAt: number;
  metadata?: {
    duration?: number;
    priority?: 'low' | 'medium' | 'high';
    energy?: 'low' | 'medium' | 'high';
    tags?: string[];
    dueDate?: string;
    category?: string;
    notes?: string;
  };
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  userId: string;
  description?: string;
  location?: string;
  color?: string;
  databaseId?: string;
} 