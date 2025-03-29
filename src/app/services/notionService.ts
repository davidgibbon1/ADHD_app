export async function mergeDatabaseTasks(userId: string, databaseId: string): Promise<{ 
  added: number, 
  updated: number, 
  unchanged: number, 
  total: number,
  databaseName: string
}> {
  try {
    console.log(`🔄 MERGE: Starting merge for database ${databaseId}, user ${userId}`);
    
    // Get the database from storage
    const database = await getNotionDatabaseById(databaseId);
    if (!database) {
      console.error(`🔄 MERGE: Database not found: ${databaseId}`);
      throw new Error(`Database not found: ${databaseId}`);
    }
    
    console.log(`🔄 MERGE: Got database: ${database.name}, notionDatabaseId: ${database.notionDatabaseId || 'none'}`);
    
    if (!database.notionDatabaseId) {
      console.error(`🔄 MERGE: Database has no Notion database ID: ${databaseId}`);
      throw new Error(`Database has no Notion database ID: ${databaseId}`);
    }

    // Fetch tasks from Notion
    let notionTasks: NotionTask[] = [];
    console.log(`🔄 MERGE: Fetching tasks from Notion for database ${database.name} (${database.notionDatabaseId})`);
    try {
      notionTasks = await fetchTasksFromDatabase(database);
      console.log(`🔄 MERGE: Fetched ${notionTasks.length} tasks from Notion`);
    } catch (error) {
      console.error(`🔄 MERGE: Error fetching tasks from Notion:`, error);
      throw error;
    }

    // Convert to app task format
    const appTasks = convertNotionTasksToAppFormat(notionTasks);
    console.log(`🔄 MERGE: Converted ${appTasks.length} tasks to app format`);

    // Get existing tasks from SQLite DB
    const db = getDatabase();
    console.log(`🔄 MERGE: Fetching existing tasks from local database for databaseId ${database.id} or notionDatabaseId ${database.notionDatabaseId}`);
    
    // Modified query to check multiple database ID fields
    const stmt = db.prepare(`
      SELECT * FROM tasks 
      WHERE 
        (notionDatabaseId = ? OR 
         notionDatabaseId = ? OR 
         source = ?)
    `);
    
    // Pass all database identifiers to try different formats
    const existingRows = stmt.all(database.notionDatabaseId, database.id, database.id) as TaskRow[];
    console.log(`🔄 MERGE: Found ${existingRows.length} existing tasks in local database`);

    // CRITICAL FIX: If no existing tasks are found, check the database in a more general way
    if (existingRows.length === 0) {
      console.log(`🔄 MERGE: No existing tasks found with specific database IDs, checking for any tasks...`);
      const checkStmt = db.prepare("SELECT COUNT(*) as count FROM tasks");
      const { count } = checkStmt.get() as { count: number };
      console.log(`🔄 MERGE: Total tasks in database: ${count}`);
    }

    // Organize existing tasks by their Notion ID for quick lookup
    const existingTasksByNotionId = new Map<string, TaskRow>();
    for (const row of existingRows) {
      if (row.notionId) {
        existingTasksByNotionId.set(row.notionId, row);
      }
    }
    console.log(`🔄 MERGE: Mapped ${existingTasksByNotionId.size} existing tasks by Notion ID`);

    let added = 0;
    let updated = 0;
    let unchanged = 0;

    // Process each task
    for (const task of appTasks) {
      try {
        // Check if task already exists
        const existingTask = task.notionId ? existingTasksByNotionId.get(task.notionId) : undefined;
        
        // Ensure database IDs are set correctly
        task.notionDatabaseId = database.notionDatabaseId;
        task.source = database.id;
        task.userId = userId;
        
        if (existingTask) {
          // Check if task needs updating
          if (
            existingTask.title !== task.title || 
            Boolean(existingTask.completed) !== task.completed
          ) {
            console.log(`🔄 MERGE: Updating task ${task.notionId}: ${task.title}`);
            await updateTask(existingTask.id, task);
            updated++;
          } else {
            console.log(`🔄 MERGE: Task unchanged ${task.notionId}: ${task.title}`);
            unchanged++;
          }
        } else {
          // Add new task
          console.log(`🔄 MERGE: Adding new task: ${task.title}, with notionId: ${task.notionId}`);
          const taskId = await createTask(task);
          console.log(`🔄 MERGE: Successfully created task with ID: ${taskId}`);
          added++;
        }
      } catch (taskError) {
        console.error(`🔄 MERGE: Error processing task ${task.title}:`, taskError);
        // Continue with other tasks even if one fails
      }
    }

    // Force update notionDatabaseId for all tasks from this database
    // This ensures scheduling will find them later
    if (appTasks.length > 0) {
      console.log(`🔄 MERGE: Ensuring all tasks have correct notionDatabaseId...`);
      try {
        const updateStmt = db.prepare(`
          UPDATE tasks
          SET notionDatabaseId = ?
          WHERE source = ? OR notionDatabaseId = ?
        `);
        const result = updateStmt.run(database.notionDatabaseId, database.id, database.id);
        console.log(`🔄 MERGE: Updated ${result?.changes || 0} tasks with correct notionDatabaseId`);
      } catch (updateError) {
        console.error(`🔄 MERGE: Error updating notionDatabaseId:`, updateError);
      }
    }

    // CRITICAL FIX: Check what tasks we now have for this database
    console.log(`🔄 MERGE: Verifying tasks after merge...`);
    const verifyStmt = db.prepare(`
      SELECT COUNT(*) as count FROM tasks 
      WHERE notionDatabaseId = ? OR source = ?
    `);
    const { count } = verifyStmt.get(database.notionDatabaseId, database.id) as { count: number };
    console.log(`🔄 MERGE: After merge, found ${count} tasks for this database`);

    // Update last synced timestamp
    try {
      await updateLastSynced(databaseId);
      console.log(`🔄 MERGE: Updated last synced timestamp for database ${databaseId}`);
    } catch (timestampError) {
      console.error(`🔄 MERGE: Error updating last synced timestamp:`, timestampError);
      // Continue anyway
    }

    console.log(`🔄 MERGE: Completed merge for database ${database.name}. Added: ${added}, Updated: ${updated}, Unchanged: ${unchanged}`);
    
    return {
      added,
      updated,
      unchanged,
      total: added + updated + unchanged,
      databaseName: database.name
    };
  } catch (error) {
    console.error(`🔄 MERGE: Error in mergeDatabaseTasks:`, error);
    throw error;
  }
} 