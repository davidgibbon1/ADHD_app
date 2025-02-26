import React from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, DayContent, DayProps } from 'react-day-picker';
import { format } from 'date-fns';
import { Task } from '@/lib/types';

interface TaskDayContentProps {
  date: Date;
  activeModifiers: {
    hasTasks?: boolean;
    [key: string]: boolean | undefined;
  };
}

interface CalendarProps {
  tasks: Task[];
  onSelectDate: (date: Date | undefined) => void;
}

const TaskDayContent: React.FC<TaskDayContentProps> = ({ date, activeModifiers }) => (
  <div className="relative flex h-full w-full items-center justify-center">
    <span>{format(date, 'd')}</span>
    {activeModifiers.hasTasks && (
      <div className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-purple-500"></div>
    )}
  </div>
);

export function Calendar({ tasks, onSelectDate }: CalendarProps) {
  const [date, setDate] = React.useState<Date>();
  const [month, setMonth] = React.useState<Date>(new Date());

  const handleSelect = (date: Date | undefined) => {
    setDate(date);
    onSelectDate(date);
  };

  // Get tasks for selected date
  const selectedDateTasks = React.useMemo(() => {
    if (!date) return [];
    return tasks.filter(task => {
      if (!task.metadata?.dueDate) return false;
      return format(new Date(task.metadata.dueDate), 'yyyy-MM-dd') === format(new Date(date), 'yyyy-MM-dd');
    });
  }, [tasks, date]);

  // Get tasks for each day to show dots
  const getTasksForDay = (day: Date) => {
    return tasks.filter(task => {
      if (!task.metadata?.dueDate) return false;
      return format(new Date(task.metadata.dueDate), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
    });
  };

  // Custom components for the calendar
  const footer = date ? (
    <p className="mt-4 text-sm text-center text-white/60">
      {format(date, 'PPP')}
    </p>
  ) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h2 className="text-lg font-semibold text-white">Calendar</h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setMonth(new Date())}
            className="rounded-md px-2 py-1 text-sm text-white/60 hover:bg-white/5"
          >
            Today
          </button>
          <div className="flex items-center">
            <button 
              onClick={() => {
                const newMonth = new Date(month);
                newMonth.setMonth(newMonth.getMonth() - 1);
                setMonth(newMonth);
              }}
              className="rounded-md p-1 text-white/60 hover:bg-white/5"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button 
              onClick={() => {
                const newMonth = new Date(month);
                newMonth.setMonth(newMonth.getMonth() + 1);
                setMonth(newMonth);
              }}
              className="rounded-md p-1 text-white/60 hover:bg-white/5"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-md">
          <DayPicker
            mode="single"
            selected={date}
            onSelect={handleSelect}
            month={month}
            onMonthChange={setMonth}
            footer={footer}
            className="mx-auto"
            modifiers={{
              hasTasks: (day) => getTasksForDay(day).length > 0,
            }}
            modifiersStyles={{
              hasTasks: {
                color: 'white',
                fontWeight: '500',
              }
            }}
            formatters={{
              formatCaption: (date) => format(date, 'MMMM yyyy'),
              formatWeekdayName: (date) => format(date, 'EEE')
            }}
            classNames={{
              months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-4",
              caption: "flex justify-center pt-1 relative items-center text-white",
              caption_label: "text-sm font-medium",
              nav: "space-x-1 flex items-center",
              nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 text-white",
              nav_button_previous: "absolute left-1",
              nav_button_next: "absolute right-1",
              table: "w-full border-collapse space-y-1",
              head_row: "flex",
              head_cell: "text-white/60 rounded-md w-9 font-normal text-[0.8rem]",
              row: "flex w-full mt-2",
              cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-purple-500/20 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
              day: "h-9 w-9 p-0 font-normal text-white/80 hover:bg-white/5 rounded-md transition-colors",
              day_selected: "bg-purple-500 text-white hover:bg-purple-500",
              day_today: "bg-white/5 text-white",
              day_outside: "text-white/40",
              day_disabled: "text-white/20",
              day_range_middle: "aria-selected:bg-purple-500/20",
              day_hidden: "invisible",
            }}
            components={{
              DayContent: ({ date }: DayProps) => {
                const modifiers = {
                  hasTasks: getTasksForDay(date).length > 0
                };
                return <TaskDayContent date={date} activeModifiers={modifiers} />;
              }
            }}
          />
        </div>
        
        {selectedDateTasks.length > 0 && (
          <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 text-sm font-medium text-white">
              Tasks for {format(date!, 'MMMM d, yyyy')}
            </h3>
            <ul className="space-y-2">
              {selectedDateTasks.map(task => (
                <li
                  key={task.id}
                  className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-white/5"
                >
                  <div className={`h-2 w-2 rounded-full ${
                    task.metadata?.priority === 'high' ? 'bg-red-500' :
                    task.metadata?.priority === 'medium' ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}></div>
                  <span className={`text-sm ${task.completed ? 'line-through opacity-50' : 'text-white'}`}>
                    {task.title}
                  </span>
                  {task.metadata?.duration && (
                    <span className="ml-auto text-xs text-white/40">{task.metadata.duration}m</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
} 