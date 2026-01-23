import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/api/clipboard";
import { appWindow, LogicalSize } from "@tauri-apps/api/window";
import { save } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";
import { invoke } from "@tauri-apps/api/tauri";
import {
  Copy,
  Clipboard,
  Check,
  Shield,
  ShieldAlert,
  Pin,
  PinOff,
  Terminal as TermIcon,
  Download,
  Command,
  Settings,
  Layout,
  Ghost,
} from "lucide-react";
import "xterm/css/xterm.css";
import clsx from "clsx";

import { useTabManager } from "./hooks/useTabManager";
import { TabBar } from "./components/TabBar";
import { TerminalPane } from "./components/TerminalPane";
import type { TerminalInstance } from "./types/tab";

interface Block {
  id: string;
  y: number;
  height: number;
  lines: string[];
}

interface PtyOutputPayload {
  session_id: string;
  data: number[];
}

const DEFAULT_FONT =
  '"JetBrainsMono Nerd Font", "JetBrains Mono", "Apple Color Emoji", monospace';
const FONTS = [
  {
    name: "JetBrains Mono (Nerd)",
    value:
      '"JetBrainsMono Nerd Font", "JetBrains Mono", "Apple Color Emoji", monospace',
  },
  {
    name: "Fira Code (Nerd)",
    value: '"FiraCode Nerd Font", "Fira Code", "Apple Color Emoji", monospace',
  },
  {
    name: "Hack (Nerd)",
    value: '"Hack Nerd Font", "Hack", "Apple Color Emoji", monospace',
  },
  { name: "MesloLGS NF", value: '"MesloLGS NF", "Apple Color Emoji", monospace' },
  { name: "Courier New", value: '"Courier New", "Apple Color Emoji", monospace' },
];

const WINDOW_PRESETS = [
  { name: "Horizontal", width: 800, height: 450 },
  { name: "Square", width: 500, height: 500 },
  { name: "Vertical", width: 450, height: 800 },
  { name: "Default", width: 1000, height: 700 },
];

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}T3BlbkFJ/g,
  /(?:AKIA|ASIA)[0-9A-Z]{16}/g,
  /[a-zA-Z0-9-_]{20,}\.[a-zA-Z0-9-_]{6,}\.[a-zA-Z0-9-_]{20,}/g,
];

function redactText(text: string): string {
  let redacted = text;
  SECRET_PATTERNS.forEach((pattern) => {
    redacted = redacted.replace(pattern, "<REDACTED_SECRET>");
  });
  return redacted;
}

export default function App() {
  // Tab Manager
  const tabManager = useTabManager();

  // State
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
  const [isRedactMode, setIsRedactMode] = useState(true);
  const [isPinned, setIsPinned] = useState(true);
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [showFontSettings, setShowFontSettings] = useState(false);
  const [showResizeSettings, setShowResizeSettings] = useState(false);
  const [fontFamily, setFontFamily] = useState(
    localStorage.getItem("shelll-font") || DEFAULT_FONT
  );
  const [customFont, setCustomFont] = useState("");
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [isHoveringWindow, setIsHoveringWindow] = useState(true);

  // Terminal container ref for finding panes
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  // Create first tab on mount
  useEffect(() => {
    tabManager.createTab();
  }, []);

  // Listen for PTY output and route to correct terminal
  useEffect(() => {
    const unlisten = listen<PtyOutputPayload>("pty-output", (event) => {
      const { session_id, data } = event.payload;
      const byteData = new Uint8Array(data);

      // Find the tab with this session ID
      const tab = tabManager.tabs.find((t) => t.sessionId === session_id);
      if (!tab) return;

      // Find the terminal pane element and write data
      const container = terminalContainerRef.current;
      if (container) {
        const pane = container.querySelector(
          `[data-session-id="${session_id}"]`
        ) as any;
        if (pane && pane.__writeData) {
          pane.__writeData(byteData);
        }
      }

      // Request block scan if this is the active tab
      if (tab.id === tabManager.activeTabId) {
        requestAnimationFrame(scanBlocks);
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [tabManager.tabs, tabManager.activeTabId]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K - Command palette
      if (e.metaKey && e.key === "k") {
        e.preventDefault();
        setShowCmdPalette((prev) => !prev);
        return;
      }

      // Cmd+T - New tab
      if (e.metaKey && e.key === "t") {
        e.preventDefault();
        tabManager.createTab();
        return;
      }

      // Cmd+W - Close current tab
      if (e.metaKey && e.key === "w") {
        e.preventDefault();
        if (tabManager.activeTabId) {
          tabManager.closeTab(tabManager.activeTabId);
        }
        return;
      }

      // Cmd+Shift+[ - Previous tab
      if (e.metaKey && e.shiftKey && e.key === "[") {
        e.preventDefault();
        tabManager.switchToPreviousTab();
        return;
      }

      // Cmd+Shift+] - Next tab
      if (e.metaKey && e.shiftKey && e.key === "]") {
        e.preventDefault();
        tabManager.switchToNextTab();
        return;
      }

      // Cmd+Shift+P - Toggle pin
      if (e.metaKey && e.shiftKey && e.key === "p") {
        e.preventDefault();
        if (tabManager.activeTabId) {
          tabManager.togglePin(tabManager.activeTabId);
        }
        return;
      }

      // Cmd+1-9 - Switch to tab N
      if (e.metaKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        tabManager.switchToTabByIndex(index);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tabManager]);

  // Update font in localStorage when it changes
  useEffect(() => {
    localStorage.setItem("shelll-font", fontFamily);
  }, [fontFamily]);

  // Block Scanning Logic
  const scanBlocks = useCallback(() => {
    if (!tabManager.activeTabId) return;

    const container = terminalContainerRef.current;
    if (!container) return;

    const pane = container.querySelector(
      `[data-tab-id="${tabManager.activeTabId}"]`
    ) as any;
    if (!pane || !pane.__terminal) return;

    const term = pane.__terminal;
    const buffer = term.buffer.active;
    const viewportY = buffer.viewportY;
    const rows = term.rows;
    const foundBlocks: Block[] = [];

    let inBlock = false;
    let blockStartRel = 0;
    let blockLines: string[] = [];

    for (let i = 0; i < rows; i++) {
      const lineIdx = viewportY + i;
      const line = buffer.getLine(lineIdx);
      const lineStr = line?.translateToString(true);

      if (lineStr && lineStr.length > 0) {
        if (!inBlock) {
          inBlock = true;
          blockStartRel = i;
          blockLines = [];
        }
        blockLines.push(lineStr);
      } else {
        if (inBlock) {
          addBlock(blockStartRel, i - 1, blockLines);
          inBlock = false;
        }
      }
    }
    if (inBlock) {
      addBlock(blockStartRel, rows - 1, blockLines);
    }

    function addBlock(startRel: number, endRel: number, lines: string[]) {
      const element = term?.element;
      if (!element) return;

      const clientHeight =
        element.querySelector(".xterm-screen")?.clientHeight || element.clientHeight;
      const rowHeight = clientHeight / term!.rows;

      foundBlocks.push({
        id: `blk-${viewportY}-${startRel}`,
        y: startRel * rowHeight,
        height: (endRel - startRel + 1) * rowHeight,
        lines,
      });
    }
    setBlocks(foundBlocks);
  }, [tabManager.activeTabId]);

  // Actions
  const handleCopy = async (text: string, id: string) => {
    const content = isRedactMode ? redactText(text) : text;
    await writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleSelection = (id: string) => {
    setSelectedBlockIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopySelected = async () => {
    const selectedContent = blocks
      .filter((b) => selectedBlockIds.has(b.id))
      .map((b, idx) => `### Block ${idx + 1}\n${b.lines.join("\n")}`)
      .join("\n\n");

    if (selectedContent) {
      await handleCopy(selectedContent, "basket");
      setSelectedBlockIds(new Set());
    }
  };

  const handleCopyAll = async () => {
    const container = terminalContainerRef.current;
    if (!container || !tabManager.activeTabId) return;

    const pane = container.querySelector(
      `[data-tab-id="${tabManager.activeTabId}"]`
    ) as any;
    if (!pane || !pane.__terminal) return;

    const term = pane.__terminal;
    term.selectAll();
    const text = term.getSelection();
    term.clearSelection();
    if (text) await handleCopy(text, "all");
  };

  const handleExport = async () => {
    const container = terminalContainerRef.current;
    if (!container || !tabManager.activeTabId) return;

    const pane = container.querySelector(
      `[data-tab-id="${tabManager.activeTabId}"]`
    ) as any;
    if (!pane || !pane.__terminal) return;

    const term = pane.__terminal;
    term.selectAll();
    const text = term.getSelection();
    term.clearSelection();

    const filePath = await save({
      filters: [
        {
          name: "Markdown",
          extensions: ["md"],
        },
      ],
    });

    if (filePath) {
      const content = isRedactMode ? redactText(text) : text;
      await writeTextFile(filePath, content);
    }
  };

  const togglePin = async () => {
    const newState = !isPinned;
    setIsPinned(newState);
    await appWindow.setAlwaysOnTop(newState);
  };

  const runCommand = (cmd: string) => {
    if (!tabManager.activeTab) return;
    invoke("write_to_pty", { sessionId: tabManager.activeTab.sessionId, data: cmd + "\n" });
    setShowCmdPalette(false);
    // Focus back terminal
    const container = terminalContainerRef.current;
    if (container && tabManager.activeTabId) {
      const pane = container.querySelector(
        `[data-tab-id="${tabManager.activeTabId}"]`
      ) as any;
      if (pane && pane.__terminal) {
        pane.__terminal.focus();
      }
    }
  };

  const handleResize = async (width: number, height: number) => {
    await appWindow.setSize(new LogicalSize(width, height));
    setShowResizeSettings(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Offset for header + tab bar
    const y = e.clientY - 72; // Header (40) + TabBar (32) approx
    const found = blocks.find((b) => y >= b.y && y <= b.y + b.height);
    setHoveredBlockId(found ? found.id : null);
  };

  const handleWrapperClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      if (hoveredBlockId) {
        e.stopPropagation();
        toggleSelection(hoveredBlockId);
      }
    }
  };

  const handleRegisterInstance = useCallback(
    (tabId: string, instance: TerminalInstance) => {
      tabManager.registerTerminalInstance(tabId, instance);
    },
    [tabManager]
  );

  return (
    <div
      className={clsx(
        "relative w-screen h-screen overflow-hidden flex flex-col font-sans transition-all duration-300 ease-in-out",
        "bg-neutral-950/70",
        isGhostMode && !isHoveringWindow ? "opacity-20" : "opacity-100"
      )}
      onMouseMove={(e) => {
        handleMouseMove(e);
        if (!isHoveringWindow) setIsHoveringWindow(true);
      }}
      onMouseEnter={() => setIsHoveringWindow(true)}
      onMouseLeave={() => setIsHoveringWindow(false)}
      onClickCapture={handleWrapperClick}
    >
      {/* Header */}
      <div
        data-tauri-drag-region
        className="h-10 flex items-center justify-between px-4 border-b border-white/5 bg-white/5 select-none z-50"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 group/traffic">
            <button
              onClick={() => appWindow.close()}
              className="w-3 h-3 rounded-full bg-red-500/50 hover:bg-red-500 transition-colors flex items-center justify-center group-hover/traffic:text-black/50 text-transparent text-[8px] font-bold"
            ></button>
            <button
              onClick={() => appWindow.minimize()}
              className="w-3 h-3 rounded-full bg-yellow-500/50 hover:bg-yellow-500 transition-colors"
            />
            <button
              onClick={() => appWindow.toggleMaximize()}
              className="w-3 h-3 rounded-full bg-green-500/50 hover:bg-green-500 transition-colors"
            />
          </div>

          <div className="h-4 w-[1px] bg-white/10" />

          <button
            onClick={() => setIsRedactMode(!isRedactMode)}
            className={clsx(
              "transition-colors",
              isRedactMode
                ? "text-green-400"
                : "text-red-400 opacity-50 hover:opacity-100"
            )}
            title="Toggle Auto-Redact"
          >
            {isRedactMode ? <Shield size={14} /> : <ShieldAlert size={14} />}
          </button>

          <button
            onClick={togglePin}
            className={clsx(
              "transition-colors",
              isPinned ? "text-blue-400" : "text-white/40 hover:text-white"
            )}
            title="Toggle Always-on-Top"
          >
            {isPinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>

          <button
            onClick={() => setIsGhostMode(!isGhostMode)}
            className={clsx(
              "transition-colors",
              isGhostMode ? "text-purple-400" : "text-white/40 hover:text-white"
            )}
            title="Toggle Ghost Mode (Fade on Blur)"
          >
            <Ghost size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {selectedBlockIds.size > 0 && (
            <button
              onClick={handleCopySelected}
              className="flex items-center gap-2 px-2 py-1 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors text-xs"
            >
              {copiedId === "basket" ? <Check size={14} /> : <Copy size={14} />}
              <span>Copy Basket ({selectedBlockIds.size})</span>
            </button>
          )}

          <button
            onClick={() => {
              setShowFontSettings(!showFontSettings);
              setShowResizeSettings(false);
              setShowCmdPalette(false);
            }}
            className={clsx(
              "p-1.5 rounded hover:bg-white/10 transition-colors",
              showFontSettings
                ? "text-white bg-white/10"
                : "text-white/40 hover:text-white"
            )}
            title="Font Settings"
          >
            <Settings size={14} />
          </button>

          <button
            onClick={() => {
              setShowResizeSettings(!showResizeSettings);
              setShowFontSettings(false);
              setShowCmdPalette(false);
            }}
            className={clsx(
              "p-1.5 rounded hover:bg-white/10 transition-colors",
              showResizeSettings
                ? "text-white bg-white/10"
                : "text-white/40 hover:text-white"
            )}
            title="Window Size"
          >
            <Layout size={14} />
          </button>

          <button
            onClick={() => {
              setShowCmdPalette(!showCmdPalette);
              setShowFontSettings(false);
              setShowResizeSettings(false);
            }}
            className={clsx(
              "p-1.5 rounded hover:bg-white/10 transition-colors",
              showCmdPalette
                ? "text-white bg-white/10"
                : "text-white/40 hover:text-white"
            )}
            title="Command Palette (Cmd+K)"
          >
            <Command size={14} />
          </button>

          <button
            onClick={handleExport}
            className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
            title="Export Session"
          >
            <Download size={14} />
          </button>

          <button
            onClick={handleCopyAll}
            className="group flex items-center gap-2 px-2 py-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors text-xs"
          >
            {copiedId === "all" ? (
              <Check size={14} className="text-green-400" />
            ) : (
              <Clipboard size={14} />
            )}
            <span>Copy All</span>
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <TabBar
        tabs={tabManager.sortedTabs}
        activeTabId={tabManager.activeTabId}
        onSelectTab={tabManager.switchTab}
        onCloseTab={tabManager.closeTab}
        onNewTab={tabManager.createTab}
        onTogglePin={tabManager.togglePin}
      />

      {/* Terminal Container */}
      <div className="flex-1 relative p-4 pl-6 overflow-hidden" ref={terminalContainerRef}>
        {/* Render all terminal panes - visibility controlled by CSS */}
        {tabManager.tabs.map((tab) => (
          <TerminalPane
            key={tab.id}
            tab={tab}
            isActive={tab.id === tabManager.activeTabId}
            fontFamily={fontFamily}
            onRegisterInstance={handleRegisterInstance}
            onRequestScanBlocks={scanBlocks}
          />
        ))}

        {/* Block Overlays */}
        <div className="absolute top-4 left-6 right-4 bottom-4 pointer-events-none">
          {blocks.map((block) => {
            const isSelected = selectedBlockIds.has(block.id);
            const isHovered = hoveredBlockId === block.id;

            if (!isSelected && !isHovered) return null;

            return (
              <div
                key={block.id}
                style={{ top: block.y, height: block.height }}
                className="absolute right-0 left-0 flex items-start justify-end pr-4 pointer-events-none"
              >
                {/* Highlight BG - Visual Only */}
                <div
                  className={clsx(
                    "absolute inset-0 -mx-4 rounded-lg transition-colors border border-transparent",
                    isSelected
                      ? "bg-blue-500/10 border-blue-500/20"
                      : "bg-white/[0.03] border-white/5"
                  )}
                />

                {/* Copy Button - Interactive */}
                <div className="relative z-20 flex gap-1 mt-0.5 pointer-events-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const text = block.lines.join("\n");
                      handleCopy(text, block.id);
                    }}
                    className={clsx(
                      "p-1.5 rounded-md shadow-lg transition-all transform hover:scale-105 border backdrop-blur-xl",
                      copiedId === block.id
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-neutral-800 border-white/10 text-neutral-400 hover:text-white hover:bg-neutral-700"
                    )}
                    title="Copy Block (Cmd+Click to Select)"
                  >
                    {copiedId === block.id ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Font Settings Modal */}
      {showFontSettings && (
        <div className="absolute top-12 right-24 w-64 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="text-xs font-medium text-white/40 mb-2">FONT FAMILY</div>
          <div className="flex flex-col gap-1">
            {FONTS.map((font) => (
              <button
                key={font.name}
                onClick={() => {
                  setFontFamily(font.value);
                  setShowFontSettings(false);
                }}
                className={clsx(
                  "w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between",
                  fontFamily === font.value
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                )}
                style={{ fontFamily: font.value }}
              >
                {font.name}
                {fontFamily === font.value && (
                  <Check size={12} className="text-green-400" />
                )}
              </button>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-white/5">
            <div className="text-xs font-medium text-white/40 mb-2">CUSTOM FONT</div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder='"My Font", monospace'
                value={customFont}
                onChange={(e) => setCustomFont(e.target.value)}
                className="flex-1 bg-neutral-950 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/30"
              />
              <button
                onClick={() => {
                  if (customFont) {
                    setFontFamily(customFont);
                    setShowFontSettings(false);
                  }
                }}
                className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white transition-colors"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resize Settings Modal */}
      {showResizeSettings && (
        <div className="absolute top-12 right-20 w-48 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="text-xs font-medium text-white/40 px-2 py-1 mb-1">
            WINDOW PRESETS
          </div>
          {WINDOW_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => handleResize(preset.width, preset.height)}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-white/10 text-sm text-white/80 hover:text-white flex items-center justify-between"
            >
              <span>{preset.name}</span>
              <span className="text-white/20 text-xs font-mono">
                {preset.width}x{preset.height}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Command Palette Modal */}
      {showCmdPalette && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-64 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="text-xs font-medium text-white/40 px-2 py-1 mb-1">
            QUICK COMMANDS
          </div>
          {[
            { label: "Git Status", cmd: "git status" },
            { label: "Git Diff", cmd: "git diff" },
            { label: "Node Version", cmd: "node -v" },
            { label: "Clear", cmd: "clear" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => runCommand(item.cmd)}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-white/10 text-sm text-white/80 hover:text-white flex items-center gap-2"
            >
              <TermIcon size={12} className="opacity-50" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
