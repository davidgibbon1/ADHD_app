'use client';

import { Task } from '@/lib/types';

interface TaskListProps {
  tasks: Task[];
  onToggleTask: (taskId: string, completed: boolean) => void;
  onEditTask: (taskId: string, newTitle: string) => void;
}

export default function TaskList({ tasks, onToggleTask, onEditTask }: TaskListProps) {
  return (
    <ul className="space-y-3">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center gap-3 p-3 bg-white/5 backdrop-blur-lg rounded-lg border border-white/10">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={(e) => onToggleTask(task.id, e.target.checked)}
            className="w-5 h-5 border-gray-300 rounded focus:ring-purple-500"
          />
          
          <span
            onClick={() => onEditTask(task.id, task.title)}
            className={`flex-1 cursor-pointer ${task.completed ? 'line-through text-gray-500' : 'text-white'}`}
          >
            {task.title}
          </span>

          {task.metadata?.priority && (
            <span className={`px-2 py-1 text-xs rounded-full ${
              task.metadata.priority === 'high' ? 'bg-red-500/10 text-red-400' :
              task.metadata.priority === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
              'bg-green-500/10 text-green-400'
            }`}>
              {task.metadata.priority}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
} 