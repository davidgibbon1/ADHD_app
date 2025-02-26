'use client';

import { useState } from 'react';
import { useTasks } from '@/lib/hooks/useTasks';
import TaskList from '@/components/TaskList';
import { useAuth } from '@/lib/hooks/useAuth';
import { LogOut } from 'lucide-react';

export default function TasksPage() {
  const { user, signOut } = useAuth();
  const { tasks, loading, error, toggleTask, updateTask, addTask } = useTasks();
  const [newTaskTitle, setNewTaskTitle] = useState('');

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-white">Loading tasks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  // Handle the edit task action
  const handleEditTask = (taskId: string, newTitle: string) => {
    updateTask(taskId, { title: newTitle });
  };

  // Handle creating a new task
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskTitle.trim() && user) {
      addTask({
        title: newTaskTitle,
        completed: false,
        userId: user.uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setNewTaskTitle('');
    }
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Your Tasks</h1>
        <button
          onClick={signOut}
          className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-white hover:bg-white/20"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
      
      <form onSubmit={handleCreateTask} className="mb-6 flex gap-2">
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="Add a new task..."
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-white/50 backdrop-blur-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          Add Task
        </button>
      </form>
      
      <TaskList
        tasks={tasks}
        onToggleTask={toggleTask}
        onEditTask={handleEditTask}
      />
    </main>
  );
} 