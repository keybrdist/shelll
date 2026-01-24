import { useState, useCallback, useMemo } from "react";
import type { Tab, TabGroup, TileLayout, TabView } from "../types/tab";

/**
 * Calculates the optimal tile layout for a given number of terminals.
 * - 1 terminal: single view (1x1)
 * - 2 terminals: horizontal split (2x1)
 * - 3-4 terminals: 2x2 grid
 * - 5-6 terminals: 2x3 grid
 * - 7-9 terminals: 3x3 grid
 */
export function calculateTileLayout(count: number): TileLayout {
  if (count <= 1) return { rows: 1, cols: 1 };
  if (count === 2) return { rows: 1, cols: 2 };
  if (count <= 4) return { rows: 2, cols: 2 };
  if (count <= 6) return { rows: 2, cols: 3 };
  return { rows: 3, cols: 3 };
}

let groupCounter = 0;

export function useTabGroups(
  tabs: Tab[],
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>
) {
  const [groups, setGroups] = useState<TabGroup[]>([]);

  /**
   * Combine multiple tabs into a new group.
   * Removes tabs from their existing groups if any.
   */
  const combineTabs = useCallback(
    (tabIds: string[]) => {
      if (tabIds.length < 2) return null;

      // Verify all tabs exist
      const tabsToGroup = tabs.filter((t) => tabIds.includes(t.id));
      if (tabsToGroup.length < 2) return null;

      groupCounter++;
      const groupId = `group-${Date.now()}-${groupCounter}`;
      const layout = calculateTileLayout(tabIds.length);

      // Check if any tabs were pinned
      const wasPinned = tabsToGroup.some((t) => t.isPinned);

      const newGroup: TabGroup = {
        id: groupId,
        tabIds: [...tabIds],
        focusedTabId: tabIds[0],
        layout,
        createdAt: Date.now(),
        isPinned: wasPinned,
        pinnedAt: wasPinned ? Date.now() : undefined,
      };

      // Remove tabs from existing groups
      setGroups((prev) =>
        prev
          .map((g) => ({
            ...g,
            tabIds: g.tabIds.filter((id) => !tabIds.includes(id)),
            layout: calculateTileLayout(
              g.tabIds.filter((id) => !tabIds.includes(id)).length
            ),
          }))
          .filter((g) => g.tabIds.length >= 2)
      );

      // Update tabs with new groupId
      setTabs((prev) =>
        prev.map((t) =>
          tabIds.includes(t.id)
            ? { ...t, groupId, isPinned: false, pinnedAt: undefined }
            : t
        )
      );

      // Add new group
      setGroups((prev) => [...prev, newGroup]);

      return newGroup;
    },
    [tabs, setTabs]
  );

  /**
   * Detach a tab from its group and return it to the main tab list.
   */
  const detachTab = useCallback(
    (groupId: string, tabId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;

      const remainingTabIds = group.tabIds.filter((id) => id !== tabId);
      const tab = tabs.find((t) => t.id === tabId);

      // Update the tab to remove group association
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, groupId: undefined, isPinned: group.isPinned }
            : t
        )
      );

      if (remainingTabIds.length < 2) {
        // Dissolve the group - restore remaining tab to normal state
        setTabs((prev) =>
          prev.map((t) =>
            remainingTabIds.includes(t.id)
              ? { ...t, groupId: undefined, isPinned: group.isPinned }
              : t
          )
        );
        setGroups((prev) => prev.filter((g) => g.id !== groupId));
      } else {
        // Update group with remaining tabs
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  tabIds: remainingTabIds,
                  focusedTabId:
                    g.focusedTabId === tabId
                      ? remainingTabIds[0]
                      : g.focusedTabId,
                  layout: calculateTileLayout(remainingTabIds.length),
                }
              : g
          )
        );
      }
    },
    [groups, tabs, setTabs]
  );

  /**
   * Add a tab to an existing group.
   */
  const addToGroup = useCallback(
    (groupId: string, tabId: string) => {
      const group = groups.find((g) => g.id === groupId);
      const tab = tabs.find((t) => t.id === tabId);
      if (!group || !tab) return;

      // If tab is in another group, remove it first
      if (tab.groupId && tab.groupId !== groupId) {
        detachTab(tab.groupId, tabId);
      }

      const newTabIds = [...group.tabIds, tabId];

      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, groupId, isPinned: false, pinnedAt: undefined }
            : t
        )
      );

      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                tabIds: newTabIds,
                layout: calculateTileLayout(newTabIds.length),
              }
            : g
        )
      );
    },
    [groups, tabs, setTabs, detachTab]
  );

  /**
   * Set the focused pane within a group.
   */
  const setFocusedPane = useCallback((groupId: string, tabId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, focusedTabId: tabId } : g))
    );
  }, []);

  /**
   * Navigate to the next/previous pane within a group.
   */
  const navigatePane = useCallback(
    (groupId: string, direction: "next" | "prev" | "up" | "down" | "left" | "right") => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;

      const currentIndex = group.tabIds.indexOf(group.focusedTabId);
      if (currentIndex === -1) return;

      const { rows, cols } = group.layout;
      let newIndex = currentIndex;

      switch (direction) {
        case "next":
          newIndex = (currentIndex + 1) % group.tabIds.length;
          break;
        case "prev":
          newIndex =
            (currentIndex - 1 + group.tabIds.length) % group.tabIds.length;
          break;
        case "right":
          newIndex = currentIndex + 1;
          if (newIndex % cols === 0 || newIndex >= group.tabIds.length) {
            newIndex = currentIndex - (currentIndex % cols);
          }
          break;
        case "left":
          newIndex = currentIndex - 1;
          if (currentIndex % cols === 0) {
            newIndex = Math.min(
              currentIndex + cols - 1,
              group.tabIds.length - 1
            );
          }
          break;
        case "down":
          newIndex = currentIndex + cols;
          if (newIndex >= group.tabIds.length) {
            newIndex = currentIndex % cols;
          }
          break;
        case "up":
          newIndex = currentIndex - cols;
          if (newIndex < 0) {
            const lastRowStart = Math.floor((group.tabIds.length - 1) / cols) * cols;
            newIndex = Math.min(lastRowStart + (currentIndex % cols), group.tabIds.length - 1);
          }
          break;
      }

      if (newIndex >= 0 && newIndex < group.tabIds.length) {
        setFocusedPane(groupId, group.tabIds[newIndex]);
      }
    },
    [groups, setFocusedPane]
  );

  /**
   * Pin/unpin a group.
   */
  const pinGroup = useCallback((groupId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, isPinned: true, pinnedAt: Date.now() } : g
      )
    );
  }, []);

  const unpinGroup = useCallback((groupId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, isPinned: false, pinnedAt: undefined } : g
      )
    );
  }, []);

  const toggleGroupPin = useCallback(
    (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (group) {
        if (group.isPinned) {
          unpinGroup(groupId);
        } else {
          pinGroup(groupId);
        }
      }
    },
    [groups, pinGroup, unpinGroup]
  );

  /**
   * Handle tab closure within a group.
   */
  const handleTabCloseInGroup = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab?.groupId) return false;

      const group = groups.find((g) => g.id === tab.groupId);
      if (!group) return false;

      const remainingTabIds = group.tabIds.filter((id) => id !== tabId);

      if (remainingTabIds.length < 2) {
        // Dissolve the group
        setTabs((prev) =>
          prev.map((t) =>
            remainingTabIds.includes(t.id)
              ? { ...t, groupId: undefined, isPinned: group.isPinned }
              : t
          )
        );
        setGroups((prev) => prev.filter((g) => g.id !== tab.groupId));
      } else {
        // Update group with remaining tabs
        setGroups((prev) =>
          prev.map((g) =>
            g.id === tab.groupId
              ? {
                  ...g,
                  tabIds: remainingTabIds,
                  focusedTabId:
                    g.focusedTabId === tabId
                      ? remainingTabIds[0]
                      : g.focusedTabId,
                  layout: calculateTileLayout(remainingTabIds.length),
                }
              : g
          )
        );
      }

      return true;
    },
    [tabs, groups, setTabs]
  );

  /**
   * Get group by ID.
   */
  const getGroup = useCallback(
    (groupId: string) => groups.find((g) => g.id === groupId),
    [groups]
  );

  /**
   * Get group for a specific tab.
   */
  const getGroupForTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab?.groupId) return null;
      return groups.find((g) => g.id === tab.groupId) || null;
    },
    [tabs, groups]
  );

  /**
   * Build TabView list for the tab bar - combines singles and groups.
   */
  const tabViews = useMemo((): TabView[] => {
    const views: TabView[] = [];
    const groupedTabIds = new Set(groups.flatMap((g) => g.tabIds));

    // Add single tabs (not in any group)
    tabs
      .filter((t) => !groupedTabIds.has(t.id))
      .forEach((tab) => {
        views.push({ type: "single", tab });
      });

    // Add groups
    groups.forEach((group) => {
      const groupTabs = group.tabIds
        .map((id) => tabs.find((t) => t.id === id))
        .filter((t): t is Tab => t !== undefined);
      if (groupTabs.length >= 2) {
        views.push({ type: "group", group, tabs: groupTabs });
      }
    });

    // Sort: pinned first (by pinnedAt), then unpinned (by createdAt)
    return views.sort((a, b) => {
      const aIsPinned =
        a.type === "single" ? a.tab.isPinned : a.group.isPinned;
      const bIsPinned =
        b.type === "single" ? b.tab.isPinned : b.group.isPinned;
      const aPinnedAt =
        a.type === "single" ? a.tab.pinnedAt : a.group.pinnedAt;
      const bPinnedAt =
        b.type === "single" ? b.tab.pinnedAt : b.group.pinnedAt;
      const aCreatedAt =
        a.type === "single" ? a.tab.createdAt : a.group.createdAt;
      const bCreatedAt =
        b.type === "single" ? b.tab.createdAt : b.group.createdAt;

      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;
      if (aIsPinned && bIsPinned) {
        return (aPinnedAt || 0) - (bPinnedAt || 0);
      }
      return aCreatedAt - bCreatedAt;
    });
  }, [tabs, groups]);

  return {
    groups,
    tabViews,
    combineTabs,
    detachTab,
    addToGroup,
    setFocusedPane,
    navigatePane,
    pinGroup,
    unpinGroup,
    toggleGroupPin,
    handleTabCloseInGroup,
    getGroup,
    getGroupForTab,
  };
}

export type TabGroupManager = ReturnType<typeof useTabGroups>;
