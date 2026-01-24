export interface Tab {
  id: string;
  sessionId: string;
  title: string;
  isPinned: boolean;
  createdAt: number;
  pinnedAt?: number;
  groupId?: string; // Reference to TabGroup if part of a tiled group
}

export interface TerminalInstance {
  terminal: import("xterm").Terminal;
  fitAddon: import("xterm-addon-fit").FitAddon;
}

/**
 * TileLayout defines the grid configuration for a tiled pane group.
 * - 1 terminal: single view (1x1)
 * - 2 terminals: horizontal split (2x1)
 * - 3-4 terminals: 2x2 grid
 * - 5-6 terminals: 2x3 grid
 * - 7-9 terminals: 3x3 grid
 */
export interface TileLayout {
  rows: number;
  cols: number;
}

/**
 * TabGroup represents a collection of tabs displayed in a tiled layout.
 */
export interface TabGroup {
  id: string;
  tabIds: string[];
  focusedTabId: string;
  layout: TileLayout;
  createdAt: number;
  isPinned: boolean;
  pinnedAt?: number;
}

/**
 * TabView represents either a single tab or a tab group in the tab bar.
 * This allows the tab bar to render both individual tabs and groups uniformly.
 */
export type TabView =
  | { type: "single"; tab: Tab }
  | { type: "group"; group: TabGroup; tabs: Tab[] };
