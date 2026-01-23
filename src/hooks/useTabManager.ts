import { useState, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { Tab, TerminalInstance } from "../types/tab";

let tabCounter = 0;

export function useTabManager() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const terminalInstances = useRef<Map<string, TerminalInstance>>(new Map());

  const createTab = useCallback(async (): Promise<Tab | null> => {
    try {
      const sessionId = await invoke<string>("create_pty_session");
      tabCounter++;
      const tab: Tab = {
        id: `tab-${Date.now()}-${tabCounter}`,
        sessionId,
        title: `Shell ${tabCounter}`,
        isPinned: false,
        createdAt: Date.now(),
      };

      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      return tab;
    } catch (err) {
      console.error("Failed to create tab:", err);
      return null;
    }
  }, []);

  const closeTab = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      // Clean up PTY session
      try {
        await invoke("close_pty_session", { sessionId: tab.sessionId });
      } catch (err) {
        console.error("Failed to close PTY session:", err);
      }

      // Clean up terminal instance
      const instance = terminalInstances.current.get(tabId);
      if (instance) {
        instance.terminal.dispose();
        terminalInstances.current.delete(tabId);
      }

      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId);
        // If we're closing the active tab, switch to another
        if (activeTabId === tabId && filtered.length > 0) {
          const currentIndex = prev.findIndex((t) => t.id === tabId);
          const newIndex = Math.min(currentIndex, filtered.length - 1);
          setActiveTabId(filtered[newIndex].id);
        } else if (filtered.length === 0) {
          setActiveTabId(null);
        }
        return filtered;
      });
    },
    [tabs, activeTabId]
  );

  const pinTab = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, isPinned: true, pinnedAt: Date.now() } : tab
      )
    );
  }, []);

  const unpinTab = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, isPinned: false, pinnedAt: undefined } : tab
      )
    );
  }, []);

  const togglePin = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      if (tab.isPinned) {
        unpinTab(tabId);
      } else {
        pinTab(tabId);
      }
    }
  }, [tabs, pinTab, unpinTab]);

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  // Helper to compute sorted tabs
  const getSortedTabs = useCallback((currentTabs: Tab[]) => {
    const pinned = currentTabs
      .filter((t) => t.isPinned)
      .sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));
    const unpinned = currentTabs
      .filter((t) => !t.isPinned)
      .sort((a, b) => a.createdAt - b.createdAt);
    return [...pinned, ...unpinned];
  }, []);

  const switchToTabByIndex = useCallback(
    (index: number) => {
      const sorted = getSortedTabs(tabs);
      if (index >= 0 && index < sorted.length) {
        setActiveTabId(sorted[index].id);
      }
    },
    [tabs, getSortedTabs]
  );

  const switchToPreviousTab = useCallback(() => {
    const sorted = getSortedTabs(tabs);
    const currentIndex = sorted.findIndex((t) => t.id === activeTabId);
    if (currentIndex > 0) {
      setActiveTabId(sorted[currentIndex - 1].id);
    } else if (sorted.length > 0) {
      // Wrap around to last tab
      setActiveTabId(sorted[sorted.length - 1].id);
    }
  }, [tabs, activeTabId, getSortedTabs]);

  const switchToNextTab = useCallback(() => {
    const sorted = getSortedTabs(tabs);
    const currentIndex = sorted.findIndex((t) => t.id === activeTabId);
    if (currentIndex < sorted.length - 1) {
      setActiveTabId(sorted[currentIndex + 1].id);
    } else if (sorted.length > 0) {
      // Wrap around to first tab
      setActiveTabId(sorted[0].id);
    }
  }, [tabs, activeTabId, getSortedTabs]);

  const registerTerminalInstance = useCallback(
    (tabId: string, instance: TerminalInstance) => {
      terminalInstances.current.set(tabId, instance);
    },
    []
  );

  const getTerminalInstance = useCallback((tabId: string) => {
    return terminalInstances.current.get(tabId);
  }, []);

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, title } : tab))
    );
  }, []);

  // Computed: sorted tabs - pinned first (by pin time), then unpinned (by creation time)
  const sortedTabs = useMemo(() => {
    const pinned = tabs
      .filter((t) => t.isPinned)
      .sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));
    const unpinned = tabs
      .filter((t) => !t.isPinned)
      .sort((a, b) => a.createdAt - b.createdAt);
    return [...pinned, ...unpinned];
  }, [tabs]);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) || null,
    [tabs, activeTabId]
  );

  return {
    tabs,
    sortedTabs,
    activeTabId,
    activeTab,
    createTab,
    closeTab,
    pinTab,
    unpinTab,
    togglePin,
    switchTab,
    switchToTabByIndex,
    switchToPreviousTab,
    switchToNextTab,
    registerTerminalInstance,
    getTerminalInstance,
    updateTabTitle,
  };
}

export type TabManager = ReturnType<typeof useTabManager>;
