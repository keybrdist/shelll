import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { invoke } from "@tauri-apps/api/tauri";
import type { Tab, TerminalInstance } from "../types/tab";

interface TerminalPaneProps {
  tab: Tab;
  isActive: boolean;
  fontFamily: string;
  fontSize: number;
  onRegisterInstance: (tabId: string, instance: TerminalInstance) => void;
  onRequestScanBlocks: () => void;
}

export function TerminalPane({
  tab,
  isActive,
  fontFamily,
  fontSize,
  onRegisterInstance,
  onRequestScanBlocks,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const term = new Terminal({
      fontFamily,
      fontSize,
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: "#00000000",
        foreground: "#eeeeee",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Register instance with tab manager
    onRegisterInstance(tab.id, { terminal: term, fitAddon });

    // Data flow - write to specific session
    term.onData((data) => {
      invoke("write_to_pty", { sessionId: tab.sessionId, data });
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
        invoke("resize_pty", {
          sessionId: tab.sessionId,
          rows: term.rows,
          cols: term.cols,
        }).catch(() => {});
        onRequestScanBlocks();
      }
    });
    resizeObserver.observe(containerRef.current);

    term.onRender(() => {
      onRequestScanBlocks();
    });

    return () => {
      resizeObserver.disconnect();
      // Don't dispose terminal here - it will be disposed by tab manager on close
    };
  }, [tab.id, tab.sessionId, fontFamily, fontSize, onRegisterInstance, onRequestScanBlocks]);

  // Update font when it changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.fontFamily = fontFamily;
      fitAddonRef.current?.fit();
    }
  }, [fontFamily]);

  // Update font size when it changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
    }
  }, [fontSize]);

  // Focus terminal when tab becomes active
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
      // Refit when becoming active to ensure correct sizing
      fitAddonRef.current?.fit();
    }
  }, [isActive]);

  // Method to write data to terminal (called from parent via ref or event)
  const writeData = useCallback((data: Uint8Array) => {
    if (terminalRef.current) {
      terminalRef.current.write(data);
    }
  }, []);

  // Expose writeData via data attribute for parent to access
  useEffect(() => {
    if (containerRef.current) {
      (containerRef.current as any).__writeData = writeData;
      (containerRef.current as any).__terminal = terminalRef.current;
      (containerRef.current as any).__fitAddon = fitAddonRef.current;
    }
  }, [writeData]);

  return (
    <div
      ref={containerRef}
      data-tab-id={tab.id}
      data-session-id={tab.sessionId}
      className="w-full h-full"
      style={{
        visibility: isActive ? "visible" : "hidden",
        position: isActive ? "relative" : "absolute",
        top: 0,
        left: 0,
      }}
    />
  );
}
