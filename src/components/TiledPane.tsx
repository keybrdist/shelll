import { useEffect, useRef, useCallback } from "react";
import type { Tab, TabGroup, TerminalInstance } from "../types/tab";
import { TerminalPane } from "./TerminalPane";

interface TiledPaneProps {
  group: TabGroup;
  tabs: Tab[];
  isActive: boolean;
  fontFamily: string;
  fontSize: number;
  onRegisterInstance: (tabId: string, instance: TerminalInstance) => void;
  onRequestScanBlocks: () => void;
  onFocusPane: (groupId: string, tabId: string) => void;
  getTerminalInstance: (tabId: string) => TerminalInstance | undefined;
}

export function TiledPane({
  group,
  tabs,
  isActive,
  fontFamily,
  fontSize,
  onRegisterInstance,
  onRequestScanBlocks,
  onFocusPane,
  getTerminalInstance,
}: TiledPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Build grid template based on layout
  const gridStyle = {
    display: "grid",
    gridTemplateRows: `repeat(${group.layout.rows}, 1fr)`,
    gridTemplateColumns: `repeat(${group.layout.cols}, 1fr)`,
    gap: "2px",
    width: "100%",
    height: "100%",
  };

  // Handle click on a pane to focus it
  const handlePaneClick = useCallback(
    (tabId: string) => {
      onFocusPane(group.id, tabId);
    },
    [group.id, onFocusPane]
  );

  // Refit all terminals when the group container resizes
  useEffect(() => {
    if (!containerRef.current || !isActive) return;

    const resizeObserver = new ResizeObserver(() => {
      // Refit all terminals in the group
      group.tabIds.forEach((tabId) => {
        const instance = getTerminalInstance(tabId);
        if (instance?.fitAddon) {
          requestAnimationFrame(() => {
            instance.fitAddon.fit();
          });
        }
      });
      onRequestScanBlocks();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isActive, group.tabIds, getTerminalInstance, onRequestScanBlocks]);

  // Focus the active pane's terminal when the group becomes active
  useEffect(() => {
    if (isActive && group.focusedTabId) {
      const instance = getTerminalInstance(group.focusedTabId);
      if (instance?.terminal) {
        instance.terminal.focus();
      }
    }
  }, [isActive, group.focusedTabId, getTerminalInstance]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        visibility: isActive ? "visible" : "hidden",
        position: isActive ? "relative" : "absolute",
        top: 0,
        left: 0,
      }}
    >
      <div style={gridStyle}>
        {tabs.map((tab) => {
          const isFocused = tab.id === group.focusedTabId;
          return (
            <div
              key={tab.id}
              className="relative overflow-hidden"
              onClick={() => handlePaneClick(tab.id)}
              style={{
                outline: isFocused ? "2px solid rgba(59, 130, 246, 0.8)" : "none",
                outlineOffset: "-2px",
                borderRadius: "4px",
                transition: "outline 0.15s ease",
              }}
            >
              {/* Focus indicator dot */}
              {isFocused && (
                <div
                  className="absolute top-1 right-1 w-2 h-2 rounded-full z-10"
                  style={{
                    backgroundColor: "rgba(59, 130, 246, 0.9)",
                    boxShadow: "0 0 4px rgba(59, 130, 246, 0.5)",
                  }}
                />
              )}
              {/* Scaled terminal container - scale down to fit more content */}
              <div
                style={{
                  width: "111.11%", // 1/0.9 to compensate for scale
                  height: "111.11%",
                  transform: "scale(0.9)",
                  transformOrigin: "top left",
                }}
              >
                <TerminalPane
                  tab={tab}
                  isActive={isActive}
                  fontFamily={fontFamily}
                  fontSize={fontSize}
                  onRegisterInstance={onRegisterInstance}
                  onRequestScanBlocks={onRequestScanBlocks}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
