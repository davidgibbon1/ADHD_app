import React from 'react';
import { MoreHorizontal, Calendar, Clock, Tag as TagIcon } from 'lucide-react';

interface TaskMetadata {
  duration?: number;
  priority?: 'low' | 'medium' | 'high';
  energy?: 'low' | 'medium' | 'high';
  tags?: string[];
  date?: Date;
}

interface TaskItemProps {
  id: string;
  title: string;
  completed: boolean;
  metadata?: TaskMetadata;
  onToggle: (id: string) => void;
  onEdit: (id: string, title: string) => void;
}

const TaskItem: React.FC<TaskItemProps> = ({
  id,
  title,
  completed,
  metadata,
  onToggle,
  onEdit,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedTitle, setEditedTitle] = React.useState(title);

  const handleSubmit = () => {
    onEdit(id, editedTitle);
    setIsEditing(false);
  };

  // Format date if it exists
  const formattedDate = metadata?.date 
    ? new Date(metadata.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  // Get priority color
  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500/10 text-red-400';
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-400';
      case 'low':
        return 'bg-green-500/10 text-green-400';
      default:
        return 'bg-gray-500/10 text-gray-400';
    }
  };

  return (
    <div className="group relative flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-all hover:bg-white/10">
      <div className="flex h-5 w-5 items-center justify-center pt-0.5">
        <input
          type="checkbox"
          checked={completed}
          onChange={() => onToggle(id)}
          className="h-4 w-4 rounded-sm border-2 border-white/30 bg-transparent text-purple-500 transition-colors checked:border-purple-500 checked:bg-purple-500 hover:border-purple-500 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-[#191919]"
        />
      </div>
      
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            className="w-full bg-transparent text-white focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-md px-2 py-1"
            autoFocus
          />
        ) : (
          <div
            onClick={() => setIsEditing(true)}
            className="cursor-text"
          >
            <span className={`text-white ${completed ? 'line-through opacity-50' : ''}`}>
              {title}
            </span>
          </div>
        )}
        
        {metadata && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-sm">
            {formattedDate && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
                <Calendar className="h-3 w-3" />
                {formattedDate}
              </span>
            )}
            {metadata.duration && (
              <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400">
                <Clock className="h-3 w-3" />
                {metadata.duration}m
              </span>
            )}
            {metadata.priority && (
              <span className={`rounded-md px-2 py-0.5 text-xs ${getPriorityColor(metadata.priority)}`}>
                {metadata.priority}
              </span>
            )}
            {metadata.tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-400"
              >
                <TagIcon className="h-3 w-3" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      
      <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded-md transition-all">
        <MoreHorizontal className="h-4 w-4 text-white/60" />
      </button>
    </div>
  );
};

export default TaskItem; 