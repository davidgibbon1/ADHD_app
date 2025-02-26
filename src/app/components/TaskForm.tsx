import { Task } from "@/src/types";
import { title } from "process";

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!title.trim()) return;

  const newTask: Task = {
    id: '',
    title: title.trim(),
    completed: false,
    metadata: {
      dueDate: Date ? new Date(date).toISOString() : undefined,
      priority: priority || undefined,
      category: category || undefined,
      notes: notes?.trim() || undefined,
    },
  };

  // ... existing code ...
}; 