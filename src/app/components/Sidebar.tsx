import React from 'react';
import { Calendar, BarChart2, Tag, Clock, Menu } from 'lucide-react';

interface ActionButton {
  id: string;
  label: string;
  icon: string;
  action: () => void;
}

interface SidebarProps {
  actions: ActionButton[];
}

const Sidebar: React.FC<SidebarProps> = ({ actions }) => {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-64'} flex-none transition-all duration-300 ease-in-out`}>
      <div className="fixed h-screen glass-effect border-r border-white/10">
        <div className="flex h-14 items-center justify-between px-4">
          {!isCollapsed && (
            <h1 className="text-lg font-semibold text-white">Task Assistant</h1>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="rounded-lg p-1.5 hover:bg-white/10"
          >
            <Menu className="h-5 w-5 text-white" />
          </button>
        </div>
        
        <nav className="flex flex-col gap-2 p-3">
          {actions.map((action) => {
            const Icon = action.icon === 'analytics' ? BarChart2 :
                        action.icon === 'label' ? Tag :
                        action.icon === 'schedule' ? Clock :
                        Calendar;
            
            return (
              <button
                key={action.id}
                onClick={action.action}
                className="sidebar-button"
              >
                <Icon className="h-5 w-5" />
                {!isCollapsed && (
                  <span className="flex-1 truncate">{action.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <button
            onClick={() => {}} // This will be connected to schedule generation
            className={`w-full animate-gradient rounded-lg px-4 py-3 text-sm font-medium text-white transition-all hover:shadow-lg hover:shadow-purple-500/20 active:scale-95 ${
              isCollapsed ? 'h-12 w-12 p-0' : ''
            }`}
          >
            {isCollapsed ? (
              <Clock className="mx-auto h-5 w-5" />
            ) : (
              'Generate Schedule'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar; 