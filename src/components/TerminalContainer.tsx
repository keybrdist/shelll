import { forwardRef, useCallback } from "react";
import type { Tab, TabGroup, TerminalInstance, TabView } from "../types/tab";
import { TerminalPane } from "./TerminalPane";
import { TiledPane } from "./TiledPane";

interface TerminalContainerProps {
  tabs: Tab[];
  groups: TabGroup[];
  tabViews: TabView[];
  activeTabId: string | null;
  activeGroupId: string | null;
  fontFamily: string;
  fontSize: number;
  onRegisterInstance: (tabId: string, instance: TerminalInstance) => void;
  onRequestScanBlocks: () => void;
  onFocusPane: (groupId: string, tabId: string) => void;
  getTerminalInstance: (tabId: string) => TerminalInstance | undefined;
}

export const TerminalContainer = forwardRef<HTMLDivElement, TerminalContainerProps>(
  (
    {
      tabs,
      groups,
      activeTabId,
      activeGroupId,
      fontFamily,
      fontSize,
      onRegisterInstance,
      onRequestScanBlocks,
      onFocusPane,
      getTerminalInstance,
    },
    ref
  ) => {
    // Find tabs that are not in any group
    const groupedTabIds = new Set(groups.flatMap((g) => g.tabIds));
    const singleTabs = tabs.filter((t) => !groupedTabIds.has(t.id));

    return (
      <div ref={ref} className="flex-1 relative p-4 pl-6 overflow-hidden">
        {/* Render single terminal panes (not in groups) */}
        {singleTabs.map((tab) => (
          <TerminalPane
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId && !activeGroupId}
            fontFamily={fontFamily}
            fontSize={fontSize}
            onRegisterInstance={onRegisterInstance}
            onRequestScanBlocks={onRequestScanBlocks}
          />
        ))}

        {/* Render tiled pane groups */}
        {groups.map((group) => {
          const groupTabs = group.tabIds
            .map((id) => tabs.find((t) => t.id === id))
            .filter((t): t is Tab => t !== undefined);

          if (groupTabs.length < 2) return null;

          return (
            <TiledPane
              key={group.id}
              group={group}
              tabs={groupTabs}
              isActive={group.id === activeGroupId}
              fontFamily={fontFamily}
              fontSize={fontSize}
              onRegisterInstance={onRegisterInstance}
              onRequestScanBlocks={onRequestScanBlocks}
              onFocusPane={onFocusPane}
              getTerminalInstance={getTerminalInstance}
            />
          );
        })}
      </div>
    );
  }
);

TerminalContainer.displayName = "TerminalContainer";
