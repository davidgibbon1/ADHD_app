import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { Task } from '@/lib/types';

export function useTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const fetchTasks = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/tasks?userId=${user.uid}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch tasks');
        }

        const data = await response.json();
        setTasks(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching tasks:', err);
        setError('Failed to load tasks');
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [user]);

  const toggleTask = async (taskId: string, completed: boolean) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });

      if (!response.ok) throw new Error('Failed to update task');

      setTasks(prev => 
        prev.map(task => 
          task.id === taskId ? { ...task, completed } : task
        )
      );
    } catch (err) {
      console.error('Error toggling task:', err);
      setError('Failed to update task');
    }
  };

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Failed to update task');

      setTasks(prev => 
        prev.map(task => 
          task.id === taskId ? { ...task, ...updates } : task
        )
      );
    } catch (err) {
      console.error('Error updating task:', err);
      setError('Failed to update task');
    }
  };

  const addTask = async (task: Omit<Task, 'id'>) => {
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, userId: user?.uid }),
      });

      if (!response.ok) throw new Error('Failed to create task');

      const { id } = await response.json();
      setTasks(prev => [...prev, { ...task, id }]);
    } catch (err) {
      console.error('Error adding task:', err);
      setError('Failed to create task');
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete task');

      setTasks(prev => prev.filter(task => task.id !== taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
      setError('Failed to delete task');
    }
  };

  return {
    tasks,
    loading,
    error,
    toggleTask,
    updateTask,
    addTask,
    deleteTask,
  };
} 