import { Suspense } from 'react';
import TaskList from './TaskList';
import { getUserTasks } from '@/lib/localStorage/storageUtils';

async function TasksLoader({ userId }: { userId: string }) {
  const tasks = getUserTasks(userId);
  
  return (
    <TaskList
      tasks={tasks}
      onToggleTask={() => {}}
      onEditTask={() => {}}
    />
  );
}

export default function TasksContainer({ userId }: { userId: string }) {
  return (
    <Suspense fallback={<div>Loading tasks...</div>}>
      <TasksLoader userId={userId} />
    </Suspense>
  );
} 