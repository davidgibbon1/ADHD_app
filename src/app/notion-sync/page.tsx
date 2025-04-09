'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import AuthCheck from '@/components/AuthCheck';
import Sidebar from '@/components/Sidebar';
import NotionHeader from '@/components/NotionHeader';
import { 
  Download, 
  RefreshCw, 
  Check, 
  AlertCircle, 
  Info, 
  X, 
  Clock, 
  Tag, 
  Plus, 
  Filter, 
  MoreHorizontal, 
  Trash2 
} from 'lucide-react';
import { getOrCreateUserId } from '@/lib/localStorage/storageUtils';
import { ExtendedTask } from '@/lib/db/sqliteService';
import NotionDatabaseManager from '@/components/NotionDatabaseManager';
import { NotionDatabase } from '@/lib/db/notionDatabaseService';
import { useRouter } from 'next/navigation';

export default function NotionSync() {
  const router = useRouter();
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
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [filterSource, setFilterSource] = useState('all');
  const [filterTag, setFilterTag] = useState('');

  const [databases, setDatabases] = useState<NotionDatabase[]>([]);

  // For editing tasks inline
  const [editingField, setEditingField] = useState<{taskId: string, field: string} | null>(null);
  const [newTag, setNewTag] = useState('');

  // Detailed task view
  const [detailedTask, setDetailedTask] = useState<ExtendedTask | null>(null);
  const [taskNotes, setTaskNotes] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  // Track "Add Task" inputs per-database
  const [newTaskTitles, setNewTaskTitles] = useState<{ [dbId: string]: string }>({});

  // Per-DB view mode: either "table" or "board"
  // If you want each DB to have its own setting, store an object keyed by db.id -> 'table'|'board'
  // For simplicity, this example just uses a single state (but you can easily adapt).
  const [viewModes, setViewModes] = useState<{ [dbId: string]: 'table' | 'board' }>({});

  // 1. Fetch Notion databases
  useEffect(() => {
    async function fetchAllDatabases() {
      try {
        const userIdLocal = user?.uid || getOrCreateUserId();
        const res = await fetch(`/api/notion-databases?userId=${userIdLocal}`);
        if (!res.ok) throw new Error('Failed to fetch Notion databases');
        const dbData = await res.json();
        setDatabases(dbData);
      } catch (err) {
        console.error('Error fetching databases:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch databases');
      }
    }
    fetchAllDatabases();
  }, [user]);

  // 2. Fetch all tasks
  useEffect(() => {
    fetchTasks();
  }, []);

  // 3. Extract all unique tags
  useEffect(() => {
    const allTags = new Set<string>();
    tasks.forEach(task => {
      if (task.metadata?.tags) {
        task.metadata.tags.forEach(tag => {
          if (!['daily','weekly','monthly'].includes(tag)) {
            allTags.add(tag);
          }
        });
      }
    });
    setAvailableTags(Array.from(allTags));
  }, [tasks]);

  async function fetchTasks() {
    try {
      const userIdLocal = user?.uid || getOrCreateUserId();
      console.log(`Fetching tasks for user: ${userIdLocal}`);
      
      const response = await fetch(`/api/tasks?userId=${encodeURIComponent(userIdLocal)}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch tasks: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`Received ${data.length} tasks from API`);
      
      // Show detailed task info for debugging
      if (data.length > 0) {
        console.log('Sample tasks with tags:', data.slice(0, 5).map((t: ExtendedTask) => ({
          title: t.title,
          completed: t.completed,
          source: t.source,
          notionId: t.notionId,
          tags: t.metadata?.tags || []
        })));
      } else {
        console.warn('No tasks returned from API!');
      }
      
      setTasks(data);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    }
  }

  // 4. Sync all Notion databases
  async function handleSyncTasks() {
    setIsLoading(true);
    setError(null);
    setSyncResult(null);
    setDownloadReady(false);

    try {
      const userIdLocal = user?.uid || getOrCreateUserId();
      const response = await fetch('/api/notion-sync/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userIdLocal }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync tasks');
      }

      const result = await response.json();
      setSyncResult(result);
      fetchTasks(); // Refresh tasks
    } catch (err) {
      console.error('Error syncing tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to sync tasks');
    } finally {
      setIsLoading(false);
    }
  }

  // 5. Export tasks
  async function handleExportTasks() {
    setIsLoading(true);
    setError(null);
    setDownloadReady(false);

    try {
      const userIdLocal = user?.uid || getOrCreateUserId();
      const response = await fetch(`/api/notion-sync?userId=${userIdLocal}`, { method: 'GET' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to export tasks');
      }

      // Download the resulting JSON
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
    } catch (err) {
      console.error('Error exporting tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to export tasks');
    } finally {
      setIsLoading(false);
    }
  }

  // 6. Task updating
  async function updateTaskField(taskId: string, field: string, value: any) {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      console.log(`Updating task ${taskId}, field: ${field}, value:`, value);

      const updates: any = {};
      switch (field) {
        case 'title':
          updates.title = value;
          break;
        case 'completed':
          updates.completed = value;
          break;
        case 'status':
          updates.completed = (value === 'done');
          break;
        case 'removeTag':
          {
            const currentTags = [...(task.metadata?.tags || [])];
            updates.metadata = {
              ...task.metadata,
              tags: currentTags.filter(tag => tag !== value)
            };
          }
          break;
        case 'tag':
          {
            // Ensure metadata exists with at least an empty tags array
            const currentTags = [...(task.metadata?.tags || [])];
            const newTag = String(value).trim();
            
            if (newTag && !currentTags.includes(newTag)) {
              console.log(`Adding tag "${newTag}" to task "${task.title}"`);
              currentTags.push(newTag);
              
              // Ensure we're not overwriting other metadata
              updates.metadata = { 
                ...(task.metadata || {}), 
                tags: currentTags 
              };
            }
          }
          break;
        default:
          // All other fields go in metadata
          updates.metadata = { ...task.metadata, [field]: value };
          break;
      }

      if (Object.keys(updates).length === 0) {
        console.log('No updates to apply');
        return;
      }

      console.log('Applying updates:', updates);

      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update task');
      }

      // Update the local task
      setTasks(prev => 
        prev.map(t => t.id === taskId ? { ...t, ...updates } : t)
      );

      // Clear editing field if this was for title, dueDate, priority, etc.
      if (editingField?.taskId === taskId) {
        setEditingField(null);
      }
    } catch (err) {
      console.error('Error updating task:', err);
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  }

  // 7. Detailed task view
  function openDetailedTaskView(task: ExtendedTask) {
    setDetailedTask(task);
    setTaskNotes(task.metadata?.notes || '');
  }
  function closeDetailedTaskView() {
    setDetailedTask(null);
    setTaskNotes('');
  }
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        closeDetailedTaskView();
      }
    }
    if (detailedTask) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [detailedTask]);

  async function updateTaskNotes() {
    if (!detailedTask) return;
    try {
      await updateTaskField(detailedTask.id, 'notes', taskNotes);
    } catch (error) {
      console.error('Error updating notes:', error);
    }
  }

  // 8. Create a new task in the given database
  async function handleCreateTask(db: NotionDatabase) {
    try {
      const userIdLocal = user?.uid || getOrCreateUserId();
      const title = (newTaskTitles[db.id] || '').trim();
      if (!title) return;

      // Set up appropriate tags based on database
      const tags: string[] = [];
      
      // Add a tag for the database
      tags.push(`db-${db.id}`);

      // Construct new task with guaranteed metadata
      const task: Omit<ExtendedTask, 'id'> = {
        title,
        completed: false,
        source: 'app',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        userId: userIdLocal,
        // Set the notionDatabaseId if this is a Notion database
        notionDatabaseId: db.notionDatabaseId || undefined,
        // Always set the database_id to maintain the relationship
        database_id: db.id,
        metadata: {
          tags: tags
        }
      };

      console.log(`Creating task "${title}" in database ${db.name} (${db.id}), notionDatabaseId: ${db.notionDatabaseId || 'none'}`);

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      
      if (!response.ok) throw new Error('Failed to create task');

      // Immediately refresh tasks after creating a new one
      await fetchTasks(); 
      setNewTaskTitles(prev => ({ ...prev, [db.id]: '' }));
    } catch (err) {
      console.error('Error creating new task:', err);
      setError(err instanceof Error ? err.message : 'Failed to create new task');
    }
  }

  // 9. Filter tasks overall by source + tag
  const filteredTasks = tasks.filter(task => {
    // Source
    if (filterSource === 'notion' && task.source !== 'notion') return false;
    if (filterSource === 'app' && task.source !== 'app') return false;
    // Tag
    if (filterTag && !task.metadata?.tags?.includes(filterTag)) return false;
    return true;
  });

  // 10. Board view rendering
  function renderBoardView(tasksForDb: ExtendedTask[]) {
    // Simple grouping: Not Started, In Progress, Done
    const notStarted = tasksForDb.filter(
      t => !t.completed && (!t.metadata?.category || t.metadata.category === 'Not Started')
    );
    const inProgress = tasksForDb.filter(
      t => !t.completed && t.metadata?.category === 'In Progress'
    );
    const done = tasksForDb.filter(t => t.completed);

    const renderTaskCard = (task: ExtendedTask) => (
      <div 
        key={task.id} 
        className="bg-[#262626] rounded-md p-3 border border-white/5 hover:border-white/20 mb-2 relative group"
      >
        {/* Delete button - appears on hover */}
        <button
          onClick={(e) => {
            e.stopPropagation(); // Prevent opening detailed view
            handleDeleteTask(task.id, task.title);
          }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 rounded-full p-1 text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-opacity"
          title="Delete Task"
        >
          <Trash2 size={14} />
        </button>
        
        {/* Clickable area to open task details */}
        <div 
          className="cursor-pointer"
          onClick={() => openDetailedTaskView(task)}
        >
          <div className="text-sm font-medium text-white mb-2">{task.title}</div>
          
          {task.metadata?.dueDate && (
            <div className="text-xs text-red-400 mb-1">
              Due: {new Date(task.metadata.dueDate).toLocaleDateString()}
            </div>
          )}
          
          {task.metadata?.tags && task.metadata.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {task.metadata.tags
                .filter(tag => !tag.startsWith('notion-') && !tag.startsWith('db-'))
                .map(tag => (
                  <span key={tag} className="inline-flex rounded-full px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400">
                    {tag}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    );

    return (
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Not Started */}
        <div className="bg-[#1A1A1A] rounded-md p-3">
          <h4 className="text-sm font-medium text-white/70 mb-3 px-2">Not Started ({notStarted.length})</h4>
          {notStarted.length > 0 ? notStarted.map(renderTaskCard) : (
            <div className="bg-[#333333] rounded-md p-2 text-xs text-white/50 text-center">
              No tasks
            </div>
          )}
        </div>

        {/* In Progress */}
        <div className="bg-[#1A1A1A] rounded-md p-3">
          <h4 className="text-sm font-medium text-white/70 mb-3 px-2">In Progress ({inProgress.length})</h4>
          {inProgress.length > 0 ? inProgress.map(renderTaskCard) : (
            <div className="bg-[#333333] rounded-md p-2 text-xs text-white/50 text-center">
              No tasks
            </div>
          )}
        </div>

        {/* Done */}
        <div className="bg-[#1A1A1A] rounded-md p-3">
          <h4 className="text-sm font-medium text-white/70 mb-3 px-2">Done ({done.length})</h4>
          {done.length > 0 ? done.map(renderTaskCard) : (
            <div className="bg-[#333333] rounded-md p-2 text-xs text-white/50 text-center">
              No tasks
            </div>
          )}
        </div>
      </div>
    );
  }

  // 11. Table view rendering
  function renderTaskTable(tasksForDb: ExtendedTask[]) {
    if (tasksForDb.length === 0) {
      return (
        <div className="mb-6 p-4 bg-[#262626] rounded-md text-white/50 text-center">
          No tasks for this database.
        </div>
      );
    }
    return (
      <div className="overflow-hidden rounded-md border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Due Date</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Priority</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Time (hrs)</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Tags</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tasksForDb.map((task) => (
                <tr key={task.id} className="hover:bg-white/5">
                  {/* Title */}
                  <td className="px-4 py-3 text-sm text-white">
                    {editingField?.taskId === task.id && editingField.field === 'title' ? (
                      <input
                        type="text"
                        defaultValue={task.title}
                        onBlur={(e) => updateTaskField(task.id, 'title', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateTaskField(task.id, 'title', (e.target as HTMLInputElement).value);
                          }
                        }}
                        autoFocus
                        className="w-full bg-white/5 border border-white/20 text-white rounded-md px-2 py-1"
                      />
                    ) : (
                      <div
                        onClick={() => setEditingField({ taskId: task.id, field: 'title' })}
                        className="cursor-pointer"
                      >
                        {task.title}
                      </div>
                    )}
                  </td>

                  {/* Due Date */}
                  <td className="px-4 py-3 text-sm text-white">
                    {editingField?.taskId === task.id && editingField.field === 'dueDate' ? (
                      <input
                        type="date"
                        defaultValue={task.metadata?.dueDate ? new Date(task.metadata.dueDate).toISOString().split('T')[0] : ''}
                        onBlur={(e) => {
                          updateTaskField(task.id, 'dueDate', e.target.value);
                        }}
                        autoFocus
                        className="bg-white/5 border border-white/20 text-white rounded-md px-2 py-1"
                      />
                    ) : (
                      <div
                        onClick={() => setEditingField({ taskId: task.id, field: 'dueDate' })}
                        className="cursor-pointer"
                      >
                        {task.metadata?.dueDate
                          ? new Date(task.metadata.dueDate).toLocaleDateString()
                          : <span className="text-white/30">Set date</span>
                        }
                      </div>
                    )}
                  </td>

                  {/* Priority */}
                  <td className="px-4 py-3 text-sm text-white">
                    {editingField?.taskId === task.id && editingField.field === 'priority' ? (
                      <select
                        defaultValue={task.metadata?.priority || ''}
                        onChange={(e) => updateTaskField(task.id, 'priority', e.target.value)}
                        onBlur={() => setEditingField(null)}
                        autoFocus
                        className="bg-white/5 border border-white/20 text-white rounded-md px-2 py-1"
                      >
                        <option value="">None</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    ) : (
                      <div
                        onClick={() => setEditingField({ taskId: task.id, field: 'priority' })}
                        className="cursor-pointer"
                      >
                        {task.metadata?.priority
                          ? <span className="inline-block rounded-full px-2 py-1 text-xs bg-purple-500/20 text-purple-400">
                              {task.metadata.priority}
                            </span>
                          : <span className="text-white/30">Set priority</span>
                        }
                      </div>
                    )}
                  </td>

                  {/* Status (completed yes/no) */}
                  <td className="px-4 py-3 text-sm text-white">
                    {editingField?.taskId === task.id && editingField.field === 'status' ? (
                      <select
                        defaultValue={task.completed ? 'done' : 'not-started'}
                        onChange={(e) => updateTaskField(task.id, 'status', e.target.value)}
                        onBlur={() => setEditingField(null)}
                        autoFocus
                        className="bg-white/5 border border-white/20 text-white rounded-md px-2 py-1"
                      >
                        <option value="not-started">Not Started</option>
                        <option value="in-progress">In Progress</option>
                        <option value="done">Done</option>
                      </select>
                    ) : (
                      <div
                        onClick={() => setEditingField({ taskId: task.id, field: 'status' })}
                        className="cursor-pointer"
                      >
                        {task.completed
                          ? <span className="inline-block rounded-full px-2 py-1 text-xs bg-green-500/20 text-green-400">Done</span>
                          : <span className="inline-block rounded-full px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400">Not Started</span>
                        }
                      </div>
                    )}
                  </td>

                  {/* Time (duration) */}
                  <td className="px-4 py-3 text-sm text-white">
                    {editingField?.taskId === task.id && editingField.field === 'duration' ? (
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        defaultValue={task.metadata?.duration || ''}
                        onChange={(e) => updateTaskField(task.id, 'duration', parseFloat(e.target.value))}
                        onBlur={() => setEditingField(null)}
                        autoFocus
                        className="bg-white/5 border border-white/20 text-white rounded-md px-2 py-1 w-20"
                      />
                    ) : (
                      <div
                        onClick={() => setEditingField({ taskId: task.id, field: 'duration' })}
                        className="cursor-pointer"
                      >
                        {task.metadata?.duration !== undefined
                          ? (<span className="flex items-center gap-1">
                              <Clock size={14} className="text-white/50" />
                              {task.metadata.duration}h
                             </span>)
                          : <span className="text-white/30">Set time</span>
                        }
                      </div>
                    )}
                  </td>

                  {/* Tags */}
                  <td className="px-4 py-3 text-sm text-white">
                    <div className="flex flex-wrap gap-1">
                      {task.metadata?.tags?.filter(tag => !['daily','weekly','monthly'].includes(tag))
                        .map(tag => (
                          <span key={tag} className="inline-flex items-center rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-400">
                            {tag}
                            <button
                              onClick={() => updateTaskField(task.id, 'removeTag', tag)}
                              className="ml-1 hover:text-white"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))
                      }
                      {editingField?.taskId === task.id && editingField.field === 'tags' ? (
                        <>
                          <input
                            type="text"
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyDown={(e) => handleTagKeyDown(e, task.id)}
                            onBlur={() => setEditingField(null)}
                            autoFocus
                            placeholder="Add tag..."
                            className="bg-white/5 border border-white/20 text-white rounded-md px-2 py-1 text-xs"
                          />
                          <button
                            onClick={() => {
                              if (newTag.trim()) {
                                updateTaskField(task.id, 'tag', newTag);
                                setNewTag('');
                              }
                            }}
                            className="rounded-md bg-purple-500/20 text-purple-400 px-1 py-0.5 hover:bg-purple-500/30"
                          >
                            <Plus size={14} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEditingField({ taskId: task.id, field: 'tags' })}
                          className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50 hover:bg-white/20"
                        >
                          <Plus size={10} className="mr-1" />
                          Add tag
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-white">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openDetailedTaskView(task)}
                        className="rounded-full p-1 text-white/60 hover:text-white hover:bg-white/10"
                        title="View Details"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id, task.title)}
                        className="rounded-full p-1 text-red-400/60 hover:text-red-400 hover:bg-red-400/10"
                        title="Delete Task"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 12. Detailed task modal
  function renderDetailedTaskView() {
    if (!detailedTask) return null;
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div ref={modalRef} className="bg-[#1E1E1E] rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">Task Details</h2>
            <button onClick={closeDetailedTaskView} className="text-white/70 hover:text-white">
              <X size={20} />
            </button>
          </div>
          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Title */}
            <div>
              <label className="text-xs text-white/50">Task Title</label>
              <input
                type="text"
                defaultValue={detailedTask.title}
                onBlur={(e) => updateTaskField(detailedTask.id, 'title', e.target.value)}
                className="w-full bg-transparent text-xl font-medium text-white border-b border-white/10 pb-1 focus:outline-none"
              />
            </div>

            {/* Status/Completion */}
            <div>
              <label className="text-xs text-white/50 block mb-1">Status</label>
              <select
                value={detailedTask.completed ? 'done' : 'not-started'}
                onChange={(e) => {
                  const isDone = e.target.value === 'done';
                  updateTaskField(detailedTask.id, 'completed', isDone);
                }}
                className="bg-[#2a2a2a] border border-white/10 rounded-md px-3 py-1.5 text-white"
              >
                <option value="not-started">Not Started</option>
                <option value="in-progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            {/* Priority, Due Date, etc. */}
            <div className="space-y-2">
              <div>
                <label className="text-xs text-white/50 block mb-1">Due Date</label>
                <input
                  type="date"
                  defaultValue={detailedTask.metadata?.dueDate
                    ? new Date(detailedTask.metadata.dueDate).toISOString().split('T')[0]
                    : ''
                  }
                  onChange={(e) => updateTaskField(detailedTask.id, 'dueDate', e.target.value)}
                  className="bg-[#2a2a2a] border border-white/10 rounded-md px-3 py-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">Priority</label>
                <select
                  defaultValue={detailedTask.metadata?.priority || ''}
                  onChange={(e) => updateTaskField(detailedTask.id, 'priority', e.target.value)}
                  className="bg-[#2a2a2a] border border-white/10 rounded-md px-3 py-1.5 text-white"
                >
                  <option value="">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">Time (hours)</label>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  defaultValue={detailedTask.metadata?.duration || ''}
                  onChange={(e) => updateTaskField(detailedTask.id, 'duration', parseFloat(e.target.value))}
                  className="bg-[#2a2a2a] border border-white/10 rounded-md px-3 py-1.5 text-white w-24"
                />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs text-white/50 block mb-1">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {detailedTask.metadata?.tags?.map(tag => (
                  <span key={tag} className="inline-flex items-center rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-400">
                    {tag}
                    <button
                      onClick={() => updateTaskField(detailedTask.id, 'removeTag', tag)}
                      className="ml-1 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add a tag..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => handleTagKeyDown(e, detailedTask.id)}
                  className="flex-grow bg-[#2a2a2a] border border-white/10 rounded-md px-3 py-1.5 text-white"
                />
                <button
                  onClick={() => {
                    if (newTag.trim()) {
                      updateTaskField(detailedTask.id, 'tag', newTag);
                      setNewTag('');
                    }
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-md"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-white/50 block mb-1">Notes</label>
              <textarea
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                onBlur={updateTaskNotes}
                className="w-full h-36 bg-[#2a2a2a] border border-white/10 rounded-md px-3 py-1.5 text-white resize-none"
                placeholder="Add notes about this task..."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center gap-3 p-4 border-t border-white/10">
            <button
              onClick={() => handleDeleteTask(detailedTask.id, detailedTask.title)}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20"
            >
              <Trash2 size={16} />
              Delete Task
            </button>
            
            <button
              onClick={closeDetailedTaskView}
              className="px-4 py-2 rounded-md text-sm text-white/80 hover:text-white bg-white/5 hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 13. Per-DB table/board toggle
  function getViewModeForDb(dbId: string) {
    return viewModes[dbId] || 'table';
  }
  function setViewModeForDb(dbId: string, mode: 'table' | 'board') {
    setViewModes(prev => ({ ...prev, [dbId]: mode }));
  }

  // 7. Handle tag input key events
  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>, taskId: string) {
    if (e.key === 'Enter' && newTag.trim()) {
      e.preventDefault();
      console.log(`Adding tag: ${newTag.trim()} to task ${taskId}`);
      updateTaskField(taskId, 'tag', newTag.trim());
      setNewTag('');
    }
  }

  // Add a function to delete tasks
  async function handleDeleteTask(taskId: string, taskTitle: string) {
    // Confirm deletion to prevent accidental deletes
    if (!confirm(`Are you sure you want to delete "${taskTitle}"? This cannot be undone.`)) {
      return;
    }
    
    try {
      console.log(`Deleting task: ${taskId} (${taskTitle})`);
      
      // Ensure proper URL construction with absolute path
      const apiUrl = `/api/tasks/${encodeURIComponent(taskId)}`;
      console.log(`Sending DELETE request to: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Delete response status: ${response.status}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Delete response error:', errorData);
        throw new Error(`Failed to delete task: ${response.status} ${response.statusText}`);
      }
      
      // Remove the task from local state
      setTasks(prev => prev.filter(t => t.id !== taskId));
      
      // Close detailed view if it's the task being deleted
      if (detailedTask?.id === taskId) {
        closeDetailedTaskView();
      }
      
      console.log(`Successfully deleted task: ${taskId}`);
    } catch (err) {
      console.error('Error deleting task:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete task');
      
      // Show alert to user
      alert(`Error deleting task: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Render page
  return (
    <AuthCheck>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar />
        <div className="flex-1 bg-[#121212] w-full">
          <div className="pt-16 md:pt-20 md:ml-64">
            <main className="container mx-auto max-w-5xl px-4 py-4 md:py-8">
              {/* Header and buttons */}
              <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-2xl font-bold text-white">Notion Sync</h1>
                <div className="flex flex-wrap items-center gap-2">
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

              {/* Error and Sync Results */}
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
                      Added: {syncResult.added} | Updated: {syncResult.updated} | Unchanged: {syncResult.unchanged} | 
                      Total: {syncResult.total} | Databases: {syncResult.databases || 1}
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

              {/* Database Manager */}
              <div className="mb-8">
                <NotionDatabaseManager userId={user?.uid || getOrCreateUserId()} />
              </div>

              {/* Debugging info */}
              <div className="mb-6 p-4 bg-yellow-500/20 text-yellow-300 rounded-md">
                <h3 className="font-medium mb-2">Task Status</h3>
                <p>Total tasks: {tasks.length}</p>
                <p>Filtered tasks: {filteredTasks.length}</p>
                <p>Total databases: {databases.length}</p>
                <p className="mt-2 text-sm">
                  <strong>Tip:</strong> If your tasks are missing, ensure the database is Active and click "Sync This Database" inside the Database Manager above.
                </p>
              </div>

              {/* Filter Controls */}
              <div className="mb-6 flex flex-wrap items-center gap-3">
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

              {/* Finally, list each user-added database once */}
              {databases.map(db => {
                // Determine the tasks for this DB only
                let tasksForDb: ExtendedTask[];
                if (db.notionDatabaseId) {
                  // For Notion-linked databases, use direct database ID association
                  tasksForDb = filteredTasks.filter(t => {
                    // Primary filter: Check if the task's notionDatabaseId matches this database
                    if (t.notionDatabaseId === db.notionDatabaseId) {
                      return true;
                    }
                    
                    // Check if the database_id matches 
                    if (t.database_id === db.id) {
                      return true;
                    }
                    
                    // Fallback for legacy data: Check tags for database ID
                    if (t.metadata?.tags?.some(tag => 
                      tag === `notion-db-${db.notionDatabaseId}` || 
                      tag === `notion-database-id:${db.notionDatabaseId}` ||
                      tag === `db-${db.id}`
                    )) {
                      return true;
                    }
                    
                    return false;
                  });
                } else {
                  // Local DB => match tasks that were created in this app and match this database ID
                  tasksForDb = filteredTasks.filter(t => 
                    t.database_id === db.id || 
                    (t.source === 'app' && !t.notionDatabaseId && !t.database_id) ||
                    t.metadata?.tags?.includes(`db-${db.id}`)
                  );
                }

                // Debug output
                console.log(`Database ${db.name} (${db.id}): Found ${tasksForDb.length} tasks`);
                if (tasksForDb.length > 0) {
                  console.log('Sample tasks:', tasksForDb.slice(0, 2).map(t => ({ 
                    id: t.id, 
                    title: t.title,
                    database_id: t.database_id,
                    notionDatabaseId: t.notionDatabaseId,
                    tags: t.metadata?.tags
                  })));
                }

                return (
                  <div key={db.id} className="mb-12 bg-[#1E1E1E] rounded-lg border border-white/10 overflow-hidden">
                    {/* Database header with actions */}
                    <div className="px-4 py-3 flex justify-between items-center bg-[#262626] border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-medium text-white">{db.name || 'Untitled Database'}</h3>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${db.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {db.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {db.lastSynced && (
                          <span className="text-xs text-white/50">
                            Synced {new Date(db.lastSynced).toLocaleString()}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            if (!db.notionDatabaseId) return; // no sync if no Notion ID
                            try {
                              setIsLoading(true);
                              setError(null);
                              const response = await fetch('/api/notion-sync/database', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  userId: user?.uid || getOrCreateUserId(),
                                  databaseId: db.id,
                                }),
                              });
                              if (!response.ok) throw new Error('Failed to sync database');
                              const result = await response.json();
                              setSyncResult({
                                added: result.added,
                                updated: result.updated,
                                unchanged: result.unchanged,
                                total: result.total,
                                databases: 1,
                              });
                              await fetchTasks(); // refresh with await
                            } catch (err) {
                              console.error('Error syncing database:', err);
                              setError(err instanceof Error ? err.message : 'Failed to sync database');
                            } finally {
                              setIsLoading(false);
                            }
                          }}
                          className="flex items-center gap-1 rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
                          disabled={isLoading || !db.notionDatabaseId}
                        >
                          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                          {db.notionDatabaseId ? 'Sync Now' : 'No Notion ID'}
                        </button>
                      </div>
                    </div>
                    
                    {/* Database content */}
                    <div className="p-4">
                      {/* Controls area with view toggle and search */}
                      <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
                        {/* View mode selector */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/70">View:</span>
                          <div className="flex bg-white/5 rounded-md overflow-hidden">
                            <button
                              onClick={() => setViewModeForDb(db.id, 'table')}
                              className={`px-3 py-1 text-xs ${
                                getViewModeForDb(db.id) === 'table'
                                  ? 'bg-purple-600 text-white'
                                  : 'text-white/70 hover:bg-white/10'
                              }`}
                            >
                              Table
                            </button>
                            <button
                              onClick={() => setViewModeForDb(db.id, 'board')}
                              className={`px-3 py-1 text-xs ${
                                getViewModeForDb(db.id) === 'board'
                                  ? 'bg-purple-600 text-white'
                                  : 'text-white/70 hover:bg-white/10'
                              }`}
                            >
                              Board
                            </button>
                          </div>
                          
                          <span className="ml-4 text-xs text-white/70">
                            {tasksForDb.length} tasks ({tasksForDb.filter(t => !t.completed).length} incomplete, {tasksForDb.filter(t => t.completed).length} completed)
                          </span>
                        </div>
                        
                        {/* Search input */}
                        <div className="relative w-72">
                          <input
                            type="text"
                            placeholder="Search tasks..."
                            className="w-full rounded-md border border-white/10 bg-white/5 pl-8 pr-3 py-1.5 text-sm text-white"
                          />
                          <div className="absolute left-2.5 top-1/2 -translate-y-1/2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
                              <circle cx="11" cy="11" r="8"></circle>
                              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Add task input */}
                      <div className="flex gap-2 items-center mb-4">
                        <input
                          type="text"
                          placeholder="Add a new task..."
                          value={newTaskTitles[db.id] || ''}
                          onChange={(e) => 
                            setNewTaskTitles(prev => ({
                              ...prev,
                              [db.id]: e.target.value
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (newTaskTitles[db.id] || '').trim()) {
                              handleCreateTask(db);
                            }
                          }}
                          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                        />
                        <button
                          onClick={() => handleCreateTask(db)}
                          className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700"
                        >
                          <Plus size={16} />
                          Add Task
                        </button>
                      </div>

                      {/* Tasks display - Table or Board view */}
                      {getViewModeForDb(db.id) === 'table'
                        ? renderTaskTable(tasksForDb)
                        : renderBoardView(tasksForDb)
                      }
                    </div>
                  </div>
                );
              })}

              {/* Detailed Task Modal */}
              {renderDetailedTaskView()}
            </main>
          </div>
        </div>
      </div>
    </AuthCheck>
  );
}
