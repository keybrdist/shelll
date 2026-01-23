export interface Tab {
  id: string;
  sessionId: string;
  title: string;
  isPinned: boolean;
  createdAt: number;
  pinnedAt?: number;
}

export interface TerminalInstance {
  terminal: import("xterm").Terminal;
  fitAddon: import("xterm-addon-fit").FitAddon;
}
