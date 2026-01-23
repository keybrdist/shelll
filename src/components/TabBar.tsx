import { Plus, X, Pin } from "lucide-react";
import clsx from "clsx";
import type { Tab } from "../types/tab";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onTogglePin: (tabId: string) => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onTogglePin,
}: TabBarProps) {
  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    onTogglePin(tabId);
  };

  return (
    <div className="flex items-center h-8 bg-black/20 border-b border-white/5 px-1 gap-0.5 overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onSelectTab(tab.id)}
          onContextMenu={(e) => handleContextMenu(e, tab.id)}
          className={clsx(
            "group relative flex items-center gap-1 h-6 rounded transition-all cursor-pointer",
            tab.isPinned ? "w-8 justify-center" : "px-2 pr-1 min-w-[80px] max-w-[160px]",
            activeTabId === tab.id
              ? "bg-white/10 text-white"
              : "text-white/50 hover:text-white/80 hover:bg-white/5"
          )}
        >
          {tab.isPinned ? (
            <div
              className={clsx(
                "w-2 h-2 rounded-full",
                activeTabId === tab.id ? "bg-blue-400" : "bg-white/30"
              )}
              title={tab.title}
            />
          ) : (
            <>
              <span className="text-xs truncate flex-1">{tab.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-opacity"
              >
                <X size={12} />
              </button>
            </>
          )}

          {/* Pin indicator for non-pinned tabs */}
          {!tab.isPinned && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(tab.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-opacity text-white/30 hover:text-white/60"
              title="Pin tab (right-click)"
            >
              <Pin size={10} />
            </button>
          )}
        </div>
      ))}

      {/* New Tab Button */}
      <button
        onClick={onNewTab}
        className="flex items-center justify-center w-6 h-6 rounded text-white/30 hover:text-white hover:bg-white/10 transition-colors ml-1"
        title="New Tab (Cmd+T)"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
