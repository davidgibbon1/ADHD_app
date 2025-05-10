import { Task } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

// Generate a UUID for each user session if none exists
export const getOrCreateUserId = (): string => {
  if (typeof window === 'undefined') return 'server-side';
  
  const userId = localStorage.getItem('local_user_id');
  if (!userId) {
    const newUserId = uuidv4();
    localStorage.setItem('local_user_id', newUserId);
    return newUserId;
  }
  return userId;
};

// Tasks functions
const TASKS_STORAGE_KEY = 'local_tasks';

const getStoredTasks = (): Task[] => {
  if (typeof window === 'undefined') return [];
  
  const storedTasks = localStorage.getItem(TASKS_STORAGE_KEY);
  return storedTasks ? JSON.parse(storedTasks) : [];
};

const saveTasks = (tasks: Task[]): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
};

export const getUserTasks = (userId: string): Task[] => {
  const tasks = getStoredTasks();
  return tasks.filter(task => task.userId === userId);
};

export const getTask = (taskId: string): Task | null => {
  const tasks = getStoredTasks();
  const task = tasks.find(task => task.id === taskId);
  return task || null;
};

export const addTask = (task: Omit<Task, 'id'>): string => {
  const tasks = getStoredTasks();
  const newTask: Task = {
    ...task,
    id: uuidv4(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  tasks.push(newTask);
  saveTasks(tasks);
  return newTask.id;
};

export const updateTask = (taskId: string, updates: Partial<Omit<Task, 'id'>>): void => {
  const tasks = getStoredTasks();
  const taskIndex = tasks.findIndex(task => task.id === taskId);
  
  if (taskIndex !== -1) {
    tasks[taskIndex] = {
      ...tasks[taskIndex],
      ...updates,
      updatedAt: Date.now(),
    };
    saveTasks(tasks);
  }
};

export const deleteTask = (taskId: string): void => {
  const tasks = getStoredTasks();
  const filteredTasks = tasks.filter(task => task.id !== taskId);
  saveTasks(filteredTasks);
};

export const toggleTaskCompletion = (taskId: string, completed: boolean): void => {
  updateTask(taskId, { completed });
};

export const updateTaskMetadata = (taskId: string, metadata: Task['metadata']): void => {
  const tasks = getStoredTasks();
  const taskIndex = tasks.findIndex(task => task.id === taskId);
  
  if (taskIndex !== -1) {
    tasks[taskIndex] = {
      ...tasks[taskIndex],
      metadata: {
        ...tasks[taskIndex].metadata,
        ...metadata,
      },
      updatedAt: Date.now(),
    };
    saveTasks(tasks);
  }
}; 