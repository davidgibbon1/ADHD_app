'use client';

import { useState, useEffect } from 'react';
import TaskList from './TaskList';
import { Task } from '@/lib/types';

interface ClientTasksContainerProps {
  userId: string;
}

export default function ClientTasksContainer({ userId }: ClientTasksContainerProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/tasks?userId=${userId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch tasks');
        }

        const data = await response.json();
        setTasks(data);
      } catch (err) {
        console.error('Error fetching tasks:', err);
        setError('Failed to load tasks. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchTasks();
    }
  }, [userId]);

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed }),
      });

      if (!response.ok) {
        throw new Error('Failed to update task');
      }

      // Optimistic update
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === taskId ? { ...task, completed } : task
        )
      );
    } catch (err) {
      console.error('Error toggling task:', err);
      setError('Failed to update task. Please try again.');
    }
  };

  const handleEditTask = async (taskId: string, title: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        throw new Error('Failed to update task');
      }

      // Optimistic update
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === taskId ? { ...task, title } : task
        )
      );
    } catch (err) {
      console.error('Error editing task:', err);
      setError('Failed to update task. Please try again.');
    }
  };

  if (loading) {
    return <div className="py-4">Loading tasks...</div>;
  }

  if (error) {
    return <div className="py-4 text-red-500">{error}</div>;
  }

  if (tasks.length === 0) {
    return <div className="py-4">No tasks found. Create your first task!</div>;
  }

  return (
    <TaskList
      tasks={tasks}
      onToggleTask={handleToggleTask}
      onEditTask={handleEditTask}
    />
  );
} 