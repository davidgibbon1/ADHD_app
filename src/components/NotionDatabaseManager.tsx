'use client';

import { useState, useEffect } from 'react';
import { NotionDatabase } from '@/lib/db/notionDatabaseService';
import { Edit, Trash2, Check, X, RefreshCw, Plus, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add database');
      }
      
      // Reset form and refresh databases
      setNewDatabaseId('');
      setNewDatabaseName('');
      setIsAddingDatabase(false);
      fetchDatabases();
    } catch (error) {
      console.error('Error adding database:', error);
      setError(error instanceof Error ? error.message : 'Failed to add database');
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
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync database');
      }
      
      const result = await response.json();
      
      // Update the sync results with the database ID and name
      setSyncResults({
        ...result,
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

  return (
    <div className="rounded-md bg-white/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Notion Databases</h2>
        <button
          onClick={() => setIsAddingDatabase(!isAddingDatabase)}
          className="flex items-center gap-1 rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700"
        >
          {isAddingDatabase ? <X size={16} /> : <Plus size={16} />}
          {isAddingDatabase ? 'Cancel' : 'Add Database'}
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-red-500/20 px-4 py-3 text-red-300">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {isAddingDatabase && (
        <div className="mb-4 rounded-md bg-white/10 p-4">
          <h3 className="mb-3 text-lg font-medium text-white">Add New Database</h3>
          <div className="mb-3">
            <label className="mb-1 block text-sm text-white/70">Database Name (required)</label>
            <input
              type="text"
              value={newDatabaseName}
              onChange={(e) => setNewDatabaseName(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-white"
              placeholder="My Tasks"
            />
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-sm text-white/70">Notion Database ID (optional)</label>
            <input
              type="text"
              value={newDatabaseId}
              onChange={(e) => setNewDatabaseId(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-white"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
            <p className="mt-1 text-xs text-white/50">
              Leave empty to create a local database without Notion sync
            </p>
          </div>
          <button
            onClick={addDatabase}
            disabled={isLoading}
            className="flex items-center gap-1 rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add Database
          </button>
        </div>
      )}

      {/* Database Table */}
      <div className="overflow-hidden rounded-md border border-white/10">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="px-4 py-3 text-left text-sm font-medium text-white">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-white">Last Synced</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-white">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-white">Actions</th>
            </tr>
          </thead>
          <tbody>
            {databases.length === 0 ? (
              <tr className="border-b border-white/10">
                <td colSpan={4} className="px-4 py-3 text-center text-sm text-white/70">
                  No databases found. Add one to get started.
                </td>
              </tr>
            ) : (
              databases.map((database) => (
                <tr key={database.id} className="border-b border-white/10">
                  <td className="px-4 py-3 text-sm text-white">
                    {editingDatabase?.id === database.id ? (
                      <input
                        type="text"
                        value={editingDatabase.name}
                        onChange={(e) => setEditingDatabase({ ...editingDatabase, name: e.target.value })}
                        className="w-full rounded-md border border-white/20 bg-white/5 px-2 py-1 text-white"
                      />
                    ) : (
                      <div className="flex flex-col">
                        <span>{database.name}</span>
                        {database.notionDatabaseId ? (
                          <span className="text-xs text-white/50">ID: {database.notionDatabaseId.substring(0, 8)}...</span>
                        ) : (
                          <span className="text-xs text-amber-400">Local database (no Notion ID)</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-white/70">
                    {database.lastSynced
                      ? formatDistanceToNow(new Date(database.lastSynced), { addSuffix: true })
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs ${
                        database.isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {database.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      {/* Sync button - only show if there's a Notion database ID */}
                      {database.notionDatabaseId ? (
                        <button
                          onClick={() => syncDatabase(database.id)}
                          disabled={syncingDatabase === database.id}
                          className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
                          title="Sync with Notion"
                        >
                          {syncingDatabase === database.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <RefreshCw size={16} />
                          )}
                        </button>
                      ) : (
                        <span className="rounded p-1 text-white/30" title="Cannot sync - no Notion ID">
                          <RefreshCw size={16} />
                        </span>
                      )}
                      
                      {/* Edit button */}
                      {editingDatabase?.id === database.id ? (
                        <>
                          <button
                            onClick={updateDatabase}
                            className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
                            title="Save changes"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => setEditingDatabase(null)}
                            className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
                            title="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEditingDatabase(database)}
                          className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
                          title="Edit database"
                        >
                          <Edit size={16} />
                        </button>
                      )}
                      
                      {/* Toggle active status */}
                      <button
                        onClick={() => toggleDatabaseActive(database)}
                        className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
                        title={database.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {database.isActive ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                      
                      {/* Delete button */}
                      <button
                        onClick={() => deleteDatabase(database.id)}
                        className="rounded p-1 text-red-400 hover:bg-red-500/10"
                        title="Delete database"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sync Results */}
      {syncResults && (
        <div className="mt-4 rounded-md bg-green-500/20 p-4 text-green-300">
          <h3 className="mb-2 font-medium">Sync Results: {syncResults.databaseName}</h3>
          <div className="text-sm">
            <p>Added: {syncResults.added}</p>
            <p>Updated: {syncResults.updated}</p>
            <p>Unchanged: {syncResults.unchanged}</p>
            <p>Total: {syncResults.total}</p>
          </div>
        </div>
      )}
    </div>
  );
} 