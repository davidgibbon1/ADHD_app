import { NextRequest, NextResponse } from 'next/server';
import { getTaskById, updateTask, deleteTask } from '@/lib/db/sqliteService';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;
    
    if (!taskId) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }
    
    // Check if task exists
    const existingTask = await getTaskById(taskId);
    if (!existingTask) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }
    
    // Get update data from request body
    const updates = await request.json();
    
    // Update the task
    await updateTask(taskId, updates);
    
    // Get the updated task
    const updatedTask = await getTaskById(taskId);
    
    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Failed to update task', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`DELETE request received for task: ${params.id}`);
    
    const taskId = params.id;
    
    if (!taskId) {
      console.error('DELETE error: Task ID is required');
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }
    
    // Check if task exists
    console.log(`Checking if task ${taskId} exists`);
    const existingTask = await getTaskById(taskId);
    
    if (!existingTask) {
      console.error(`DELETE error: Task not found with ID ${taskId}`);
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }
    
    // Delete the task
    console.log(`Deleting task ${taskId} (${existingTask.title})`);
    try {
      await deleteTask(taskId);
      console.log(`Task ${taskId} successfully deleted`);
    } catch (deleteError) {
      console.error(`Error in deleteTask function:`, deleteError);
      throw deleteError;
    }
    
    return NextResponse.json({ 
      success: true,
      message: `Task '${existingTask.title}' successfully deleted` 
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete task', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 