'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import AuthCheck from '@/components/AuthCheck';
import Sidebar from '@/components/Sidebar';
import NotionHeader from '@/components/NotionHeader';
import { Download, RefreshCw, Check, AlertCircle, Info, Edit, Save, X, Clock, Tag, Plus, Trash2, Filter } from 'lucide-react';
import { getOrCreateUserId } from '@/lib/localStorage/storageUtils';
import { ExtendedTask } from '@/lib/db/sqliteService';
import NotionDatabaseManager from '@/components/NotionDatabaseManager';

export default function NotionSync() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    added: number;
    updated: number;
    unchanged: number;
    total: number;
    databases?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadReady, setDownloadReady] = useState(false);
  const [tasks, setTasks] = useState<ExtendedTask[]>([]);
  const [newTag, setNewTag] = useState('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [editingField, setEditingField] = useState<{taskId: string, field: string} | null>(null);
  const [filterSource, setFilterSource] = useState('all');
  const [filterTag, setFilterTag] = useState('');

  // Fetch tasks on component mount
  useEffect(() => {
    fetchTasks();
  }, []);

  // Extract all unique tags from tasks for tag suggestions
  useEffect(() => {
    const allTags = new Set<string>();
    tasks.forEach(task => {
      if (task.metadata?.tags) {
        task.metadata.tags.forEach(tag => {
          if (!['daily', 'weekly', 'monthly'].includes(tag)) {
            allTags.add(tag);
          }
        });
      }
    });
    setAvailableTags(Array.from(allTags));
  }, [tasks]);

  const fetchTasks = async () => {
    try {
      const userId = user?.uid || getOrCreateUserId();
      console.log(`Fetching tasks for user: ${userId}`);
      
      const response = await fetch(`/api/tasks?userId=${encodeURIComponent(userId)}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      
      const data = await response.json();
      console.log(`Received ${data.length} tasks from API`);
      
      // Log more detailed information about the tasks
      if (data.length > 0) {
        console.log('Sample task:', JSON.stringify(data[0], null, 2));
        console.log('Task sources:', data.map((t: ExtendedTask) => t.source).join(', '));
        console.log('Task titles:', data.map((t: ExtendedTask) => t.title).join(', '));
        
        // Check if tasks have Notion IDs
        const notionTasks = data.filter((t: ExtendedTask) => t.notionId);
        console.log(`Found ${notionTasks.length} tasks with Notion IDs`);
      } else {
        console.log('No tasks found in the database');
      }
      
      setTasks(data);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    }
  };

  const handleSyncTasks = async () => {
    setIsLoading(true);
    setError(null);
    setSyncResult(null);
    setDownloadReady(false);

    try {
      const userId = user?.uid || getOrCreateUserId();
      const response = await fetch('/api/notion-sync/all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync tasks');
      }

      const result = await response.json();
      setSyncResult(result);
      fetchTasks(); // Refresh the task list
    } catch (error) {
      console.error('Error syncing tasks:', error);
      setError(error instanceof Error ? error.message : 'Failed to sync tasks');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportTasks = async () => {
    setIsLoading(true);
    setError(null);
    setDownloadReady(false);

    try {
      const userId = user?.uid || getOrCreateUserId();
      const response = await fetch(`/api/notion-sync?userId=${userId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to export tasks');
      }

      // Create a download link for the JSON file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notion-tasks-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setDownloadReady(true);
    } catch (error) {
      console.error('Error exporting tasks:', error);
      setError(error instanceof Error ? error.message : 'Failed to export tasks');
    } finally {
      setIsLoading(false);
    }
  };

  const updateTaskField = async (taskId: string, field: string, value: any) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      // Prepare the update object
      const updates: any = {};
      
      // Handle special fields
      if (field === 'title') {
        updates.title = value;
      } else if (field === 'completed') {
        updates.completed = value;
      } else if (field === 'status') {
        updates.completed = value === 'Completed';
        updates.metadata = {
          ...task.metadata,
          category: value === 'In progress' ? 'In progress' : task.metadata?.category
        };
      } else if (field === 'cadence') {
        // Handle cadence (daily, weekly, monthly)
        const currentTags = [...(task.metadata?.tags || [])];
        const filteredTags = currentTags.filter(tag => !['daily', 'weekly', 'monthly'].includes(tag));
        if (value) filteredTags.push(value);
        
        updates.metadata = {
          ...task.metadata,
          tags: filteredTags
        };
      } else if (field === 'tag') {
        // Add a new tag
        const currentTags = [...(task.metadata?.tags || [])];
        if (value.trim() && !currentTags.includes(value.trim())) {
          currentTags.push(value.trim());
          
          updates.metadata = {
            ...task.metadata,
            tags: currentTags
          };
        }
      } else if (field === 'removeTag') {
        // Remove a tag
        const currentTags = [...(task.metadata?.tags || [])];
        const updatedTags = currentTags.filter(tag => tag !== value);
        
        updates.metadata = {
          ...task.metadata,
          tags: updatedTags
        };
      } else {
        // Handle other metadata fields
        updates.metadata = {
          ...task.metadata,
          [field]: value
        };
      }
      
      // Send the update to the server
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update task');
      }
      
      // Refresh tasks after update
      fetchTasks();
      setEditingField(null);
      setNewTag('');
    } catch (err) {
      console.error('Error updating task:', err);
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, taskId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      updateTaskField(taskId, 'tag', newTag);
      setNewTag('');
    }
  };

  // Filter tasks based on source and tag
  const filteredTasks = tasks.filter(task => {
    // First filter by source
    if (filterSource === 'all') {
      // No source filtering
    } else if (filterSource === 'notion' && task.source !== 'notion') {
      return false;
    } else if (filterSource === 'app' && task.source !== 'app') {
      return false;
    }
    
    // Then filter by tag if a tag filter is set
    if (filterTag && (!task.metadata?.tags || !task.metadata.tags.includes(filterTag))) {
      return false;
    }
    
    return true;
  });
  
  // Add debugging for filtered tasks
  console.log(`Filtered ${filteredTasks.length} tasks out of ${tasks.length} total tasks`);
  console.log('Filter settings:', { source: filterSource, tag: filterTag });
  if (filteredTasks.length > 0) {
    console.log('First filtered task:', filteredTasks[0].title, 'Source:', filteredTasks[0].source);
  }

  // Separate completed and incomplete tasks
  const incompleteTasks = filteredTasks.filter(task => !task.completed);
  const completedTasks = filteredTasks.filter(task => task.completed);
  
  console.log(`Incomplete tasks: ${incompleteTasks.length}, Completed tasks: ${completedTasks.length}`);

  // Render a task table with the given title and tasks
  const renderTaskTable = (title: string, taskList: ExtendedTask[]) => {
    return (
      <div className="mb-8">
        <h2 className="mb-4 text-xl font-semibold text-white">{title}</h2>
        <div className="overflow-hidden rounded-md border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-medium text-white/70">Name</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-medium text-white/70">Due Date</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-medium text-white/70">Priority</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-medium text-white/70">Status</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-medium text-white/70">Time (hours)</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-sm font-medium text-white/70">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {taskList.length > 0 ? (
                  taskList.map(task => (
                    <tr key={task.id} className="hover:bg-white/5">
                      {/* Title */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-white min-h-[40px]">
                        {editingField?.taskId === task.id && editingField?.field === 'title' ? (
                          <input
                            type="text"
                            defaultValue={task.title}
                            onBlur={(e) => updateTaskField(task.id, 'title', e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && updateTaskField(task.id, 'title', e.currentTarget.value)}
                            autoFocus
                            className="w-full rounded-md border border-white/20 bg-white/5 px-2 py-1 text-white h-[30px]"
                          />
                        ) : (
                          <div 
                            onClick={() => setEditingField({taskId: task.id, field: 'title'})}
                            className="cursor-pointer hover:text-purple-400 min-h-[30px] flex items-center"
                          >
                            {task.title}
                          </div>
                        )}
                      </td>

                      {/* Due Date */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-white min-h-[40px]">
                        <div className="min-h-[30px] flex items-center relative">
                          {editingField?.taskId === task.id && editingField?.field === 'dueDate' ? (
                            <div className="h-[30px] w-full">
                              <input
                                type="date"
                                defaultValue={task.metadata?.dueDate ? new Date(task.metadata.dueDate).toISOString().split('T')[0] : ''}
                                onChange={(e) => updateTaskField(task.id, 'dueDate', e.target.value)}
                                onBlur={() => setEditingField(null)}
                                autoFocus
                                className="absolute inset-0 rounded-md border border-white/20 bg-white/5 px-2 py-1 text-white h-[30px] w-[180px] min-w-full"
                              />
                            </div>
                          ) : (
                            <div 
                              onClick={() => setEditingField({taskId: task.id, field: 'dueDate'})}
                              className="cursor-pointer h-[30px] flex items-center w-full"
                            >
                              {task.metadata?.dueDate ? (
                                <span className="text-red-400">
                                  {new Date(task.metadata.dueDate).toLocaleDateString()}
                                </span>
                              ) : (
                                <span className="text-white/30">Set date</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-white min-h-[40px]">
                        <div className="min-h-[30px] flex items-center">
                          {editingField?.taskId === task.id && editingField?.field === 'priority' ? (
                            <select
                              defaultValue={task.metadata?.priority || ''}
                              onChange={(e) => updateTaskField(task.id, 'priority', e.target.value)}
                              onBlur={() => setEditingField(null)}
                              autoFocus
                              className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-white h-[30px]"
                            >
                              <option value="">None</option>
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          ) : (
                            <div 
                              onClick={() => setEditingField({taskId: task.id, field: 'priority'})}
                              className="cursor-pointer h-[30px] flex items-center"
                            >
                              {task.metadata?.priority ? (
                                <span className={`inline-flex rounded-full px-2 py-1 text-xs ${
                                  task.metadata.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                                  task.metadata.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-blue-500/20 text-blue-400'
                                }`}>
                                  {task.metadata.priority.charAt(0).toUpperCase() + task.metadata.priority.slice(1)}
                                </span>
                              ) : (
                                <span className="text-white/30">Set priority</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-white min-h-[40px]">
                        <div className="min-h-[30px] flex items-center">
                          {editingField?.taskId === task.id && editingField?.field === 'status' ? (
                            <select
                              defaultValue={task.completed ? 'Completed' : task.metadata?.category === 'In progress' ? 'In progress' : 'Not started'}
                              onChange={(e) => updateTaskField(task.id, 'status', e.target.value)}
                              onBlur={() => setEditingField(null)}
                              autoFocus
                              className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-white h-[30px]"
                            >
                              <option value="Not started">Not started</option>
                              <option value="In progress">In progress</option>
                              <option value="Completed">Completed</option>
                            </select>
                          ) : (
                            <div 
                              onClick={() => setEditingField({taskId: task.id, field: 'status'})}
                              className="cursor-pointer h-[30px] flex items-center"
                            >
                              <span className={`inline-flex rounded-full px-2 py-1 text-xs ${
                                task.completed ? 'bg-green-500/20 text-green-400' : 
                                task.metadata?.category === 'In progress' ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-gray-500/20 text-gray-400'
                              }`}>
                                {task.completed ? 'Completed' : 
                                 task.metadata?.category === 'In progress' ? 'In progress' : 
                                 'Not started'}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Duration */}
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-white min-h-[40px]">
                        <div className="min-h-[30px] flex items-center">
                          {editingField?.taskId === task.id && editingField?.field === 'duration' ? (
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              defaultValue={task.metadata?.duration || ''}
                              onChange={(e) => updateTaskField(task.id, 'duration', parseFloat(e.target.value))}
                              onBlur={() => setEditingField(null)}
                              autoFocus
                              className="w-20 rounded-md border border-white/20 bg-white/5 px-2 py-1 text-white h-[30px]"
                            />
                          ) : (
                            <div 
                              onClick={() => setEditingField({taskId: task.id, field: 'duration'})}
                              className="cursor-pointer h-[30px] flex items-center"
                            >
                              {task.metadata?.duration !== undefined ? (
                                <span className="flex items-center gap-1">
                                  <Clock size={14} className="text-white/50" />
                                  {task.metadata.duration}h
                                </span>
                              ) : (
                                <span className="text-white/30">Set time</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Tags */}
                      <td className="px-4 py-3 text-sm text-white min-h-[40px]">
                        <div className="flex flex-wrap gap-1 min-h-[30px]">
                          {task.metadata?.tags?.filter(tag => !['daily', 'weekly', 'monthly'].includes(tag)).map(tag => (
                            <div key={tag} className="inline-flex items-center rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-400">
                              <span>{tag}</span>
                              <button 
                                onClick={() => updateTaskField(task.id, 'removeTag', tag)}
                                className="ml-1 rounded-full hover:bg-purple-500/30"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                          
                          {editingField?.taskId === task.id && editingField?.field === 'tags' ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => handleTagKeyDown(e, task.id)}
                                onBlur={() => setEditingField(null)}
                                placeholder="Add tag..."
                                autoFocus
                                className="w-24 rounded-md border border-white/20 bg-white/5 px-2 py-1 text-white text-xs h-[30px]"
                              />
                              <button
                                onClick={() => {
                                  updateTaskField(task.id, 'tag', newTag);
                                  setNewTag('');
                                }}
                                className="rounded-md bg-purple-500/20 p-1 text-purple-400 hover:bg-purple-500/30 h-[30px] w-[30px] flex items-center justify-center"
                              >
                                <Plus size={14} />
                              </button>
                              
                              {availableTags.length > 0 && (
                                <div className="absolute mt-10 z-10 bg-[#252525] border border-white/10 rounded-md p-2 shadow-lg">
                                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {availableTags.map(tag => (
                                      <button
                                        key={tag}
                                        onClick={() => {
                                          updateTaskField(task.id, 'tag', tag);
                                          setEditingField(null);
                                        }}
                                        className="text-xs rounded-full px-2 py-0.5 bg-white/10 text-white/70 hover:bg-white/20"
                                      >
                                        {tag}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingField({taskId: task.id, field: 'tags'})}
                              className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50 hover:bg-white/20"
                            >
                              <Plus size={10} className="mr-1" />
                              <span>Add tag</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-white/50">
                      No tasks found. Sync with Notion to import tasks.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AuthCheck>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 bg-[#121212]">
          <NotionHeader />
          <main className="container mx-auto max-w-5xl px-4 py-8">
            <div className="mb-8 flex items-center justify-between">
              <h1 className="text-2xl font-bold text-white">Notion Sync</h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportTasks}
                  className="flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
                  disabled={isLoading}
                >
                  <Download size={16} />
                  Export Tasks
                </button>
                <button
                  onClick={handleSyncTasks}
                  className="flex items-center gap-1 rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700"
                  disabled={isLoading}
                >
                  <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                  Sync All Databases
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-6 flex items-center gap-2 rounded-md bg-red-500/20 px-4 py-3 text-red-300">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {syncResult && (
              <div className="mb-6 flex items-center gap-2 rounded-md bg-green-500/20 px-4 py-3 text-green-300">
                <Check size={18} />
                <div>
                  <p className="font-medium">Sync completed successfully!</p>
                  <p className="text-sm">
                    Added: {syncResult.added} | Updated: {syncResult.updated} | Unchanged: {syncResult.unchanged} | Total: {syncResult.total} | Databases: {syncResult.databases || 1}
                  </p>
                </div>
              </div>
            )}

            {downloadReady && (
              <div className="mb-6 flex items-center gap-2 rounded-md bg-blue-500/20 px-4 py-3 text-blue-300">
                <Info size={18} />
                <span>Your tasks are ready to download.</span>
              </div>
            )}

            {/* Database Manager Section */}
            <div className="mb-8">
              <NotionDatabaseManager userId={user?.uid || getOrCreateUserId()} />
            </div>

            {/* Tasks Section */}
            <div className="mt-12">
              <h2 className="mb-4 text-xl font-semibold text-white">Imported Tasks</h2>
              
              {/* Filter Controls */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-1.5">
                  <Filter size={16} className="text-white/50" />
                  <select
                    className="bg-transparent text-sm text-white outline-none"
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                  >
                    <option value="all">All Sources</option>
                    <option value="notion">Notion Only</option>
                    <option value="app">App Only</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-1.5">
                  <Tag size={16} className="text-white/50" />
                  <select
                    className="bg-transparent text-sm text-white outline-none"
                    value={filterTag}
                    onChange={(e) => setFilterTag(e.target.value)}
                  >
                    <option value="">All Tags</option>
                    {availableTags.map(tag => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                </div>
                
                <button
                  onClick={fetchTasks}
                  className="flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
                >
                  <RefreshCw size={16} />
                  Refresh Tasks
                </button>
              </div>
              
              {/* Task count */}
              <div className="mb-4 text-sm text-white/70">
                Showing {incompleteTasks.length + completedTasks.length} tasks ({incompleteTasks.length} incomplete, {completedTasks.length} completed)
              </div>
              
              {/* Task Tables */}
              {renderTaskTable("Incomplete Tasks", incompleteTasks)}
              {renderTaskTable("Completed Tasks", completedTasks)}
            </div>
          </main>
        </div>
      </div>
    </AuthCheck>
  );
} 