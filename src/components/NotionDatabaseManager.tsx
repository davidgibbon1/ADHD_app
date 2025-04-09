'use client';

import { useState, useEffect } from 'react';
import { NotionDatabase } from '@/lib/db/notionDatabaseService';
import { Edit, Trash2, Check, X, RefreshCw, Plus, AlertCircle, Loader2, Eye, EyeOff, MoreHorizontal, Filter, SortAsc, SortDesc, Tag, Search, Palette } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Import the same color options as used in working-times components
const COLORS = [
  { name: 'Purple', color: '#8B5CF6' },
  { name: 'Blue', color: '#3B82F6' },
  { name: 'Green', color: '#22C55E' },
  { name: 'Yellow', color: '#EAB308' },
  { name: 'Red', color: '#EF4444' },
  { name: 'Pink', color: '#EC4899' },
  { name: 'Indigo', color: '#6366F1' },
  { name: 'Cyan', color: '#06B6D4' },
];

interface NotionDatabaseManagerProps {
  userId: string;
}

export default function NotionDatabaseManager({ userId }: NotionDatabaseManagerProps) {
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddingDatabase, setIsAddingDatabase] = useState(false);
  const [newDatabaseId, setNewDatabaseId] = useState('');
  const [newDatabaseName, setNewDatabaseName] = useState('');
  const [editingDatabase, setEditingDatabase] = useState<NotionDatabase | null>(null);
  const [syncingDatabase, setSyncingDatabase] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<{
    databaseId?: string;
    databaseName?: string;
    added: number;
    updated: number;
    unchanged: number;
    total: number;
  } | null>(null);
  // New states for Notion-like view
  const [expandedDatabaseId, setExpandedDatabaseId] = useState<string | null>(null);
  const [databaseViewMode, setDatabaseViewMode] = useState<'table' | 'board'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Fetch databases on component mount
  useEffect(() => {
    fetchDatabases();
  }, [userId]);

  const fetchDatabases = async () => {
    if (!userId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/notion-databases?userId=${userId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch databases');
      }
      
      const data = await response.json();
      setDatabases(data);
    } catch (error) {
      console.error('Error fetching databases:', error);
      setError('Failed to load Notion databases');
    } finally {
      setIsLoading(false);
    }
  };

  const addDatabase = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Validate database name
      if (!newDatabaseName.trim()) {
        throw new Error('Database name is required');
      }
      
      // Show "connecting to Notion" message if a database ID is provided
      if (newDatabaseId.trim()) {
        setError('Connecting to Notion database...');
      }
      
      const response = await fetch('/api/notion-databases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          notionDatabaseId: newDatabaseId.trim() || null, // Send null if empty
          name: newDatabaseName.trim(),
          description: '',
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add database');
      }
      
      // Reset form and refresh databases
      setNewDatabaseId('');
      setNewDatabaseName('');
      setIsAddingDatabase(false);
      fetchDatabases();
    } catch (error) {
      console.error('Error adding database:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to add database';
      
      // Format error message for UI display
      let userFriendlyError = errorMessage;
      
      // Handle specific error messages more elegantly
      if (errorMessage.includes('database ID is invalid')) {
        userFriendlyError = 'The Notion database ID you entered is not valid. Please check and try again.';
      } else if (errorMessage.includes('database could not be found')) {
        userFriendlyError = 'We couldn\'t find this Notion database. Please check the ID and your permissions.';
      } else if (errorMessage.includes('permission')) {
        userFriendlyError = 'You don\'t have permission to access this Notion database. Make sure your integration has access.';
      } else if (errorMessage.includes('rate limit')) {
        userFriendlyError = 'Too many requests to Notion API. Please wait a moment and try again.';
      } else if (errorMessage.includes('already exists')) {
        userFriendlyError = 'A database with this ID has already been added.';
      } else if (errorMessage.includes('token is not configured')) {
        userFriendlyError = 'The Notion API token is not configured. Please check your environment variables.';
      } else if (errorMessage.includes('internet connection')) {
        userFriendlyError = 'Could not connect to Notion. Please check your internet connection.';
      }
      
      setError(userFriendlyError);
    } finally {
      setIsLoading(false);
    }
  };

  const updateDatabase = async () => {
    if (!editingDatabase) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/notion-databases', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingDatabase.id,
          name: editingDatabase.name,
          description: editingDatabase.description,
          isActive: editingDatabase.isActive,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update database');
      }
      
      setEditingDatabase(null);
      await fetchDatabases();
    } catch (error) {
      console.error('Error updating database:', error);
      setError(error instanceof Error ? error.message : 'Failed to update database');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteDatabase = async (id: string) => {
    // Confirm deletion with the user
    if (!confirm('Are you sure you want to delete this database? This action cannot be undone.')) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/notion-databases?id=${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete database');
      }
      
      // Remove the database from the local state
      setDatabases(databases.filter(db => db.id !== id));
      
      // If we were editing this database, clear the editing state
      if (editingDatabase?.id === id) {
        setEditingDatabase(null);
      }
      
      // If we have sync results for this database, clear them
      if (syncResults && syncResults.databaseId === id) {
        setSyncResults(null);
      }
    } catch (error) {
      console.error('Error deleting database:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete database');
    } finally {
      setIsLoading(false);
    }
  };

  const syncDatabase = async (databaseId: string) => {
    setSyncingDatabase(databaseId);
    setError(null);
    
    try {
      const database = databases.find(db => db.id === databaseId);
      if (!database) {
        throw new Error('Database not found');
      }
      
      // Check if the database has a Notion ID
      if (!database.notionDatabaseId) {
        throw new Error('Cannot sync database without a Notion ID');
      }
      
      const response = await fetch('/api/notion-sync/database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          databaseId,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        let errorMessage = data.error || 'Failed to sync database';
        
        // Format error message for UI display
        if (errorMessage.includes('could not be found')) {
          errorMessage = `The Notion database "${database.name}" could not be found. It may have been deleted or moved.`;
        } else if (errorMessage.includes('permission')) {
          errorMessage = `You don't have permission to access the Notion database "${database.name}". Check integration access.`;
        } else if (errorMessage.includes('rate limit')) {
          errorMessage = `Too many requests to Notion API. Please wait a moment and try again.`;
        } else if (errorMessage.includes('not active')) {
          errorMessage = `The database "${database.name}" is not active. Please activate it first.`;
        }
        
        throw new Error(errorMessage);
      }
      
      // Update the sync results with the database ID and name
      setSyncResults({
        ...data,
        databaseId,
        databaseName: database.name
      });
      
      // Refresh the databases to update the lastSynced timestamp
      await fetchDatabases();
    } catch (error) {
      console.error('Error syncing database:', error);
      setError(error instanceof Error ? error.message : 'Failed to sync database');
    } finally {
      setSyncingDatabase(null);
    }
  };

  const toggleDatabaseActive = async (database: NotionDatabase) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/notion-databases', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: database.id,
          isActive: !database.isActive,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update database');
      }
      
      await fetchDatabases();
    } catch (error) {
      console.error('Error updating database:', error);
      setError(error instanceof Error ? error.message : 'Failed to update database');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle database expansion for the Notion-like detailed view
  const toggleDatabaseExpansion = (databaseId: string) => {
    setExpandedDatabaseId(expandedDatabaseId === databaseId ? null : databaseId);
  };

  // Switch database view mode (table, board, etc.)
  const handleViewModeChange = (mode: 'table' | 'board') => {
    setDatabaseViewMode(mode);
  };

  // Handle sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Render the view mode selector
  const renderViewModeSelector = () => (
    <div className="flex items-center gap-2 text-white/70 mb-4">
      <span className="text-xs">View:</span>
      <div className="flex bg-white/5 rounded-md overflow-hidden">
        <button 
          onClick={() => handleViewModeChange('table')} 
          className={`px-3 py-1 text-xs ${databaseViewMode === 'table' ? 'bg-purple-600 text-white' : 'text-white/70 hover:bg-white/10'}`}
        >
          Table
        </button>
        <button 
          onClick={() => handleViewModeChange('board')} 
          className={`px-3 py-1 text-xs ${databaseViewMode === 'board' ? 'bg-purple-600 text-white' : 'text-white/70 hover:bg-white/10'}`}
        >
          Board
        </button>
      </div>
    </div>
  );

  // Render the expanded database view with Notion-like features
  const renderExpandedDatabaseView = (database: NotionDatabase) => (
    <div className="mt-4 p-4 rounded-md bg-[#262626] border border-white/10">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-white">{database.name}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => syncDatabase(database.id)}
            className="flex items-center gap-2 rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700"
            disabled={syncingDatabase === database.id}
          >
            <RefreshCw
              size={16}
              className={syncingDatabase === database.id ? 'animate-spin' : ''}
            />
            {syncingDatabase === database.id ? 'Syncing...' : 'Sync Now'}
          </button>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:border-purple-500 focus:outline-none"
            />
          </div>
          <button className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white">
            <Filter size={16} />
          </button>
          <button className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white">
            {sortDirection === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />}
          </button>
        </div>
      </div>

      {renderViewModeSelector()}

      {databaseViewMode === 'table' ? (
        // Table view
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-medium text-white/50">
                <th className="px-4 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('name')}>
                  Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('status')}>
                  Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('dueDate')}>
                  Due Date {sortField === 'dueDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('priority')}>
                  Priority {sortField === 'priority' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-2.5">Tags</th>
                <th className="px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/10 text-sm text-white">
                <td className="px-4 py-3">
                  <input
                    type="text"
                    placeholder="Add a new task..."
                    className="w-full bg-transparent border-b border-dashed border-white/20 px-0 py-1 text-white focus:outline-none focus:border-purple-500"
                  />
                </td>
                <td className="px-4 py-3">
                  <select className="bg-[#333333] rounded-md border border-white/10 px-2 py-1 text-sm text-white">
                    <option value="not-started">Not Started</option>
                    <option value="in-progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="date"
                    className="bg-[#333333] rounded-md border border-white/10 px-2 py-1 text-sm text-white"
                  />
                </td>
                <td className="px-4 py-3">
                  <select className="bg-[#333333] rounded-md border border-white/10 px-2 py-1 text-sm text-white">
                    <option value="">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    <button className="inline-flex items-center rounded-md bg-purple-600/20 px-2 py-1 text-xs text-purple-400">
                      <Plus size={12} className="mr-1" /> Add tag
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button className="rounded-md bg-purple-600 px-2 py-1 text-xs text-white">Save</button>
                </td>
              </tr>
              
              {/* This is just sample data - will be replaced with actual tasks */}
              {database.notionDatabaseId ? (
                <tr className="text-white/50 text-sm">
                  <td colSpan={6} className="px-4 py-6 text-center">
                    This database will show actual tasks after syncing with Notion.
                  </td>
                </tr>
              ) : (
                <tr className="text-white/50 text-sm">
                  <td colSpan={6} className="px-4 py-6 text-center">
                    This is a local database. Add tasks using the form above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        // Board view
        <div className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Not Started Column */}
            <div className="bg-[#1A1A1A] rounded-md p-3">
              <h4 className="text-sm font-medium text-white/70 mb-3 px-2">Not Started</h4>
              <div className="space-y-2">
                <div className="bg-[#262626] rounded-md p-3 border border-white/5 hover:border-white/10 cursor-pointer">
                  <div className="text-sm font-medium text-white mb-2">Add a new task</div>
                  <input 
                    type="text" 
                    placeholder="Type task name and press Enter"
                    className="w-full bg-transparent text-white/70 text-sm border-b border-dashed border-white/20 pb-1 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        // Handle creating new task
                        alert('Task creation will be implemented here');
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                </div>
                
                {database.notionDatabaseId ? (
                  <div className="bg-[#333333] rounded-md p-2 text-xs text-white/50 text-center">
                    Sync with Notion to see tasks
                  </div>
                ) : null}
              </div>
            </div>
            
            {/* In Progress Column */}
            <div className="bg-[#1A1A1A] rounded-md p-3">
              <h4 className="text-sm font-medium text-white/70 mb-3 px-2">In Progress</h4>
              <div className="space-y-2">
                {database.notionDatabaseId ? (
                  <div className="bg-[#333333] rounded-md p-2 text-xs text-white/50 text-center">
                    Sync with Notion to see tasks
                  </div>
                ) : null}
              </div>
            </div>
            
            {/* Done Column */}
            <div className="bg-[#1A1A1A] rounded-md p-3">
              <h4 className="text-sm font-medium text-white/70 mb-3 px-2">Done</h4>
              <div className="space-y-2">
                {database.notionDatabaseId ? (
                  <div className="bg-[#333333] rounded-md p-2 text-xs text-white/50 text-center">
                    Sync with Notion to see tasks
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Add color picker dropdown component
  const ColorPicker = ({ 
    database, 
    onColorSelect 
  }: { 
    database: NotionDatabase, 
    onColorSelect: (databaseId: string, color: string) => Promise<void> 
  }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center ml-2 p-1 rounded hover:bg-gray-700 transition-colors"
          title="Select database color"
        >
          <div 
            className="w-4 h-4 rounded-full mr-1" 
            style={{ backgroundColor: database.color || '#888888' }}
          ></div>
          <Palette size={14} />
        </button>
        
        {isOpen && (
          <div className="absolute z-10 mt-1 -left-2 bg-[#1E1E1E] rounded-md shadow-lg p-2 border border-gray-700">
            <div className="grid grid-cols-4 gap-1">
              {COLORS.map((colorOption) => (
                <button
                  key={colorOption.name}
                  onClick={() => {
                    onColorSelect(database.id, colorOption.color);
                    setIsOpen(false);
                  }}
                  className={`w-6 h-6 rounded-md hover:ring-2 ring-white transition-all focus:outline-none ${
                    database.color === colorOption.color ? 'ring-2 ring-white' : ''
                  }`}
                  style={{ backgroundColor: colorOption.color }}
                  title={colorOption.name}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Add the updateDatabaseColor function
  const updateDatabaseColor = async (databaseId: string, color: string) => {
    try {
      const response = await fetch('/api/notion-databases', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: databaseId,
          color
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update database color');
      }
      
      // Update local state
      setDatabases(databases.map(db => 
        db.id === databaseId ? { ...db, color } : db
      ));
    } catch (error) {
      console.error('Error updating database color:', error);
      setError(error instanceof Error ? error.message : 'Failed to update color');
    }
  };

  return (
    <div className="rounded-md bg-[#1E1E1E] p-4 md:p-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Notion Databases</h2>
        <button
          onClick={() => setIsAddingDatabase(true)}
          className="flex items-center gap-1 rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700"
        >
          <Plus size={16} />
          Add Database
        </button>
      </div>

      {isAddingDatabase && (
        <div className="mb-6 rounded-md bg-[#262626] p-4">
          <h3 className="mb-4 text-sm font-medium text-white">Add New Database</h3>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-white/70">Database ID</label>
              <input
                type="text"
                value={newDatabaseId}
                onChange={(e) => setNewDatabaseId(e.target.value)}
                placeholder="Enter Notion Database ID"
                className="w-full rounded-md border border-white/10 bg-[#333333] px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/70">Database Name</label>
              <input
                type="text"
                value={newDatabaseName}
                onChange={(e) => setNewDatabaseName(e.target.value)}
                placeholder="Enter a name for this database"
                className="w-full rounded-md border border-white/10 bg-[#333333] px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={() => setIsAddingDatabase(false)}
              className="rounded-md border border-white/10 bg-transparent px-3 py-1.5 text-sm text-white hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={addDatabase}
              className="rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700"
              disabled={isLoading}
            >
              {isLoading ? 'Adding...' : 'Add Database'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className={`mb-4 flex items-start gap-3 rounded-md px-4 py-3 ${
          error.includes('Connecting to Notion database') 
            ? 'bg-blue-500/20 text-blue-300' 
            : 'bg-red-500/20 text-red-300'
        }`}>
          {error.includes('Connecting to Notion database') ? (
            <Loader2 size={18} className="animate-spin mt-0.5" />
          ) : (
            <AlertCircle size={18} className="mt-0.5" />
          )}
          <div className="flex-1">
            <div className="font-medium">
              {error.includes('Connecting to Notion database') 
                ? 'Connecting to Notion...' 
                : 'Error Adding Database'}
            </div>
            <div className="text-sm opacity-90">
              {error}
            </div>
            {error.includes('database ID is invalid') && (
              <div className="mt-2 text-xs bg-white/10 p-2 rounded">
                <p className="font-semibold mb-1">How to fix:</p>
                <p>The database ID is found in the URL of your Notion database.</p>
                <p>Example: https://www.notion.so/<strong>workspace</strong>/<strong>12a34b56c78d90efgh12</strong>...</p>
                <p>Copy only the ID portion (the characters after the last slash).</p>
              </div>
            )}
            {error.includes('database could not be found') && (
              <div className="mt-2 text-xs bg-white/10 p-2 rounded">
                <p className="font-semibold mb-1">How to fix:</p>
                <p>1. Verify the database ID is correct.</p>
                <p>2. Make sure you've shared the database with your Notion integration:</p>
                <ul className="list-disc ml-4">
                  <li>Go to your database in Notion</li>
                  <li>Click the "Share" button in the top-right</li>
                  <li>Click "Invite" and select your integration</li>
                </ul>
              </div>
            )}
            {error.includes('permission') && (
              <div className="mt-2 text-xs bg-white/10 p-2 rounded">
                <p className="font-semibold mb-1">How to fix:</p>
                <p>Your Notion integration doesn't have permission to access this database.</p>
                <ol className="list-decimal ml-4">
                  <li>Go to your database in Notion</li>
                  <li>Click the "Share" button in the top-right</li>
                  <li>Click "Invite" and select your integration</li>
                  <li>Ensure the integration has "Full access" permission</li>
                </ol>
              </div>
            )}
            {error.includes('token is not configured') && (
              <div className="mt-2 text-xs bg-white/10 p-2 rounded">
                <p className="font-semibold mb-1">How to fix:</p>
                <p>The Notion API token is missing or invalid. Please check your environment variables:</p>
                <ol className="list-decimal ml-4">
                  <li>Verify NOTION_AUTH_TOKEN is set in your .env.local file</li>
                  <li>Make sure the token is valid and has not expired</li>
                  <li>Restart the application after setting the token</li>
                </ol>
              </div>
            )}
          </div>
          <button 
            onClick={() => setError(null)}
            className="text-white/70 hover:text-white"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Database list - new implementation with both compact view and expanded Notion-like view */}
      <div className="space-y-4">
        {databases.length > 0 ? (
          databases.map((database) => (
            <div 
              key={database.id} 
              className={`bg-[#1E1E1E] border ${database.isActive ? 'border-[#333333]' : 'border-gray-700 opacity-60'} rounded-lg p-4 transition-all ${expandedDatabaseId === database.id ? 'border-l-4' : ''}`}
              style={expandedDatabaseId === database.id ? { borderLeftColor: database.color || '#333333' } : {}}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  {/* Database header */}
                  <div className="flex items-center">
                    {/* Edit Mode */}
                    {editingDatabase?.id === database.id ? (
                      <div className="flex-1">
                        <input
                          type="text"
                          value={editingDatabase.name}
                          onChange={(e) => setEditingDatabase({...editingDatabase, name: e.target.value})}
                          className="w-full bg-[#252525] border border-[#333333] rounded px-2 py-1 text-white"
                        />
                        <div className="flex items-center mt-2">
                          <button
                            onClick={updateDatabase}
                            className="flex items-center text-green-500 mr-2 px-2 py-1 rounded hover:bg-[#252525]"
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Save
                          </button>
                          <button
                            onClick={() => setEditingDatabase(null)}
                            className="flex items-center text-red-500 px-2 py-1 rounded hover:bg-[#252525]"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center flex-1">
                        {/* Database name with color indicator */}
                        <div className="flex items-center">
                          <div 
                            className="w-3 h-3 rounded-full mr-2" 
                            style={{ backgroundColor: database.color || '#888888' }}
                          ></div>
                          <h3 
                            className="text-lg font-semibold text-white mr-2 cursor-pointer" 
                            onClick={() => toggleDatabaseExpansion(database.id)}
                          >
                            {database.name}
                          </h3>
                          <ColorPicker 
                            database={database} 
                            onColorSelect={updateDatabaseColor} 
                          />
                        </div>
                        
                        {/* Notion database ID */}
                        {database.notionDatabaseId && (
                          <div className="ml-3 px-2 py-1 bg-purple-900/30 text-purple-300 text-xs rounded-md">
                            Notion ID: {database.notionDatabaseId.slice(0, 8)}...
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Action buttons */}
                    <div className="flex items-center ml-4 space-x-2">
                      {/* Edit button (only shown in view mode) */}
                      {editingDatabase?.id !== database.id && (
                        <button
                          onClick={() => setEditingDatabase(database)}
                          className="p-1 text-gray-400 hover:text-white rounded hover:bg-[#252525]"
                          title="Edit database"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      )}
                      
                      {/* Toggle active status */}
                      <button
                        onClick={() => toggleDatabaseActive(database)}
                        className={`p-1 rounded hover:bg-[#252525] ${database.isActive ? 'text-green-500' : 'text-gray-600'}`}
                        title={database.isActive ? 'Deactivate database' : 'Activate database'}
                      >
                        {database.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      
                      {/* Sync button */}
                      <button
                        onClick={() => syncDatabase(database.id)}
                        disabled={syncingDatabase === database.id}
                        className={`p-1 rounded hover:bg-[#252525] ${syncingDatabase === database.id ? 'text-blue-400 animate-pulse' : 'text-blue-500'}`}
                        title="Sync database with Notion"
                      >
                        {syncingDatabase === database.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </button>
                      
                      {/* Delete button */}
                      <button
                        onClick={() => deleteDatabase(database.id)}
                        className="p-1 text-red-500 hover:text-red-400 rounded hover:bg-[#252525]"
                        title="Delete database"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Expanded Notion-like view for this database */}
              {expandedDatabaseId === database.id && renderExpandedDatabaseView(database)}
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-white/50 bg-[#262626] rounded-md border border-white/10">
            No databases found. Add a Notion database to get started.
          </div>
        )}
      </div>

      {/* Sync results */}
      {syncResults && (
        <div className="mt-4 rounded-md bg-green-500/20 p-4 text-green-300">
          <h3 className="mb-2 font-medium">Sync Results for {syncResults.databaseName}</h3>
          <p className="text-sm">
            Added: {syncResults.added} | Updated: {syncResults.updated} | Unchanged: {syncResults.unchanged} | Total: {syncResults.total}
          </p>
        </div>
      )}
    </div>
  );
} 