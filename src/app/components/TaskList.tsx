'use client';

import { useState } from 'react';
import { Task } from '@/lib/types';
import React from 'react';

interface TaskListProps {
  tasks: Task[];
  onToggleTask: (taskId: string, completed: boolean) => void;
  onEditTask: (taskId: string, newTitle: string) => void;
}

export default function TaskList({ tasks, onToggleTask, onEditTask }: TaskListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const handleEditStart = (task: Task) => {
    setEditingId(task.id);
    setEditText(task.title);
  };

  const handleEditSave = (taskId: string) => {
    if (editText.trim()) {
      onEditTask(taskId, editText);
    }
    setEditingId(null);
  };

  const sortedTasks = React.useMemo(() => {
    return [...tasks].sort((a, b) => {
      // Sort by completion status first
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      
      // Then sort by due date if available
      const dateA = a.metadata?.dueDate ? new Date(a.metadata.dueDate) : null;
      const dateB = b.metadata?.dueDate ? new Date(b.metadata.dueDate) : null;
      
      if (dateA && dateB) {
        return dateA.getTime() - dateB.getTime();
      }
      if (dateA) return -1;
      if (dateB) return 1;
      
      // Finally sort by title
      return a.title.localeCompare(b.title);
    });
  }, [tasks]);

  return (
    <ul className="space-y-3">
      {sortedTasks.map((task) => (
        <li key={task.id} className="flex items-center gap-3 p-3 bg-white rounded-lg shadow">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={(e) => onToggleTask(task.id, e.target.checked)}
            className="w-5 h-5 border-gray-300 rounded focus:ring-blue-500"
          />
          
          {editingId === task.id ? (
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={() => handleEditSave(task.id)}
              onKeyDown={(e) => e.key === 'Enter' && handleEditSave(task.id)}
              className="flex-1 p-1 border rounded"
              autoFocus
            />
          ) : (
            <span
              onClick={() => handleEditStart(task)}
              className={`flex-1 cursor-pointer ${task.completed ? 'line-through text-gray-500' : ''}`}
            >
              {task.title}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
} 