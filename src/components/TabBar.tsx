import { useState, useCallback } from "react";
import { Plus, X, Pin, Layers, MoreHorizontal } from "lucide-react";
import clsx from "clsx";
import type { Tab, TabGroup, TabView } from "../types/tab";

interface TabBarProps {
  tabViews: TabView[];
  activeTabId: string | null;
  activeGroupId: string | null;
  selectedTabIds: Set<string>;
  onSelectTab: (tabId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onTogglePin: (tabId: string) => void;
  onToggleGroupPin: (groupId: string) => void;
  onToggleSelection: (tabId: string) => void;
  onCombineSelected: () => void;
  onDetachTab: (groupId: string, tabId: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  tabId?: string;
  groupId?: string;
}

export function TabBar({
  tabViews,
  activeTabId,
  activeGroupId,
  selectedTabIds,
  onSelectTab,
  onSelectGroup,
  onCloseTab,
  onNewTab,
  onTogglePin,
  onToggleGroupPin,
  onToggleSelection,
  onCombineSelected,
  onDetachTab,
}: TabBarProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = (
    e: React.MouseEvent,
    tabId?: string,
    groupId?: string
  ) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId, groupId });
  };

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleTabClick = (e: React.MouseEvent, tabId: string) => {
    if (e.shiftKey) {
      e.preventDefault();
      onToggleSelection(tabId);
    } else {
      onSelectTab(tabId);
    }
  };

  return (
    <>
      <div className="flex items-center h-8 bg-black/20 border-b border-white/5 px-1 gap-0.5 overflow-x-auto">
        {tabViews.map((view) => {
          if (view.type === "single") {
            const tab = view.tab;
            const isSelected = selectedTabIds.has(tab.id);
            const isActive = activeTabId === tab.id && !activeGroupId;

            return (
              <div
                key={tab.id}
                onClick={(e) => handleTabClick(e, tab.id)}
                onContextMenu={(e) => handleContextMenu(e, tab.id)}
                className={clsx(
                  "group relative flex items-center gap-1 h-6 rounded transition-all cursor-pointer",
                  tab.isPinned
                    ? "w-8 justify-center"
                    : "px-2 pr-1 min-w-[80px] max-w-[160px]",
                  isActive
                    ? "bg-white/10 text-white"
                    : isSelected
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                    : "text-white/50 hover:text-white/80 hover:bg-white/5"
                )}
              >
                {tab.isPinned ? (
                  <div
                    className={clsx(
                      "w-2 h-2 rounded-full",
                      isActive ? "bg-blue-400" : "bg-white/30"
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
                    title="Pin tab (right-click for menu)"
                  >
                    <Pin size={10} />
                  </button>
                )}

                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full" />
                )}
              </div>
            );
          } else {
            // Group view
            const { group, tabs } = view;
            const isActive = activeGroupId === group.id;

            return (
              <div
                key={group.id}
                onClick={() => onSelectGroup(group.id)}
                onContextMenu={(e) => handleContextMenu(e, undefined, group.id)}
                className={clsx(
                  "group relative flex items-center gap-1 h-6 rounded transition-all cursor-pointer px-2",
                  group.isPinned ? "min-w-[48px]" : "min-w-[100px] max-w-[200px]",
                  isActive
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                    : "text-white/50 hover:text-white/80 hover:bg-white/5"
                )}
              >
                <Layers size={12} className="flex-shrink-0" />
                {group.isPinned ? (
                  <span className="text-xs font-medium">{tabs.length}</span>
                ) : (
                  <>
                    <span className="text-xs truncate flex-1">
                      {tabs.length} tabs
                    </span>
                    <span className="text-[10px] text-white/30 truncate max-w-[60px]">
                      {tabs[0]?.title}...
                    </span>
                  </>
                )}

                {/* Group count badge */}
                <div
                  className={clsx(
                    "absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-medium px-0.5",
                    isActive
                      ? "bg-purple-500 text-white"
                      : "bg-white/20 text-white/70"
                  )}
                >
                  {tabs.length}
                </div>
              </div>
            );
          }
        })}

        {/* Combine Button - shown when multiple tabs selected */}
        {selectedTabIds.size >= 2 && (
          <button
            onClick={onCombineSelected}
            className="flex items-center gap-1 px-2 h-6 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors text-xs ml-1"
            title="Combine selected tabs (Cmd+Shift+G)"
          >
            <Layers size={12} />
            <span>Combine ({selectedTabIds.size})</span>
          </button>
        )}

        {/* New Tab Button */}
        <button
          onClick={onNewTab}
          className="flex items-center justify-center w-6 h-6 rounded text-white/30 hover:text-white hover:bg-white/10 transition-colors ml-1"
          title="New Tab (Cmd+T)"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50"
            onClick={closeContextMenu}
          />
          {/* Menu */}
          <div
            className="fixed z-50 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.tabId && (
              <>
                <button
                  onClick={() => {
                    onTogglePin(contextMenu.tabId!);
                    closeContextMenu();
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-2"
                >
                  <Pin size={12} />
                  Toggle Pin
                </button>
                <button
                  onClick={() => {
                    onToggleSelection(contextMenu.tabId!);
                    closeContextMenu();
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-2"
                >
                  <Layers size={12} />
                  {selectedTabIds.has(contextMenu.tabId!)
                    ? "Deselect for Combine"
                    : "Select for Combine"}
                </button>
                <div className="h-px bg-white/10 my-1" />
                <button
                  onClick={() => {
                    onCloseTab(contextMenu.tabId!);
                    closeContextMenu();
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2"
                >
                  <X size={12} />
                  Close Tab
                </button>
              </>
            )}
            {contextMenu.groupId && (
              <>
                <button
                  onClick={() => {
                    onToggleGroupPin(contextMenu.groupId!);
                    closeContextMenu();
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-2"
                >
                  <Pin size={12} />
                  Toggle Pin Group
                </button>
                <div className="h-px bg-white/10 my-1" />
                <div className="px-3 py-1 text-xs text-white/40">
                  Detach tab from group:
                </div>
                {tabViews
                  .filter(
                    (v): v is { type: "group"; group: TabGroup; tabs: Tab[] } =>
                      v.type === "group" && v.group.id === contextMenu.groupId
                  )
                  .flatMap((v) => v.tabs)
                  .map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        onDetachTab(contextMenu.groupId!, tab.id);
                        closeContextMenu();
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white truncate"
                    >
                      {tab.title}
                    </button>
                  ))}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
