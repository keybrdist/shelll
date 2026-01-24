import { useState, useEffect, useRef } from "react";
import { Search, X, LinkIcon, Unlink } from "lucide-react";
import clsx from "clsx";
import type { RunningApp } from "../hooks/useWindowAttachment";

interface AppPickerProps {
  isOpen: boolean;
  onClose: () => void;
  runningApps: RunningApp[];
  attachedApp: RunningApp | null;
  isLoading: boolean;
  onAttach: (app: RunningApp) => void;
  onDetach: () => void;
  onRefresh: () => void;
}

export function AppPicker({
  isOpen,
  onClose,
  runningApps,
  attachedApp,
  isLoading,
  onAttach,
  onDetach,
  onRefresh,
}: AppPickerProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      onRefresh();
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [isOpen, onRefresh]);

  if (!isOpen) return null;

  const filteredApps = runningApps.filter(
    (app) =>
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.bundle_id.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (app: RunningApp) => {
    onAttach(app);
    onClose();
  };

  const handleDetach = () => {
    onDetach();
    onClose();
  };

  return (
    <div className="absolute top-12 left-32 w-72 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-xs font-medium text-white/40">
          {attachedApp ? "ATTACHED TO" : "ATTACH TO APP"}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {/* Currently Attached */}
      {attachedApp && (
        <div className="px-3 py-2 border-b border-white/5 bg-blue-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LinkIcon size={12} className="text-blue-400" />
              <span className="text-sm text-blue-300">{attachedApp.name}</span>
            </div>
            <button
              onClick={handleDetach}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
            >
              <Unlink size={10} />
              Detach
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/5">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-950 border border-white/10 rounded pl-7 pr-2 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/30"
          />
        </div>
      </div>

      {/* App List */}
      <div className="max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="px-3 py-4 text-center text-xs text-white/40">
            Loading apps...
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-white/40">
            {search ? "No apps found" : "No running apps"}
          </div>
        ) : (
          <div className="py-1">
            {filteredApps.map((app) => {
              const isCurrentlyAttached =
                attachedApp?.bundle_id === app.bundle_id;
              return (
                <button
                  key={app.bundle_id || app.name}
                  onClick={() => !isCurrentlyAttached && handleSelect(app)}
                  disabled={isCurrentlyAttached}
                  className={clsx(
                    "w-full text-left px-3 py-2 flex items-center justify-between transition-colors",
                    isCurrentlyAttached
                      ? "bg-blue-500/10 cursor-default"
                      : "hover:bg-white/5"
                  )}
                >
                  <div className="flex flex-col min-w-0">
                    <span
                      className={clsx(
                        "text-sm truncate",
                        isCurrentlyAttached ? "text-blue-300" : "text-white/80"
                      )}
                    >
                      {app.name}
                    </span>
                    {app.bundle_id && (
                      <span className="text-[10px] text-white/20 truncate">
                        {app.bundle_id}
                      </span>
                    )}
                  </div>
                  {isCurrentlyAttached && (
                    <LinkIcon size={12} className="text-blue-400 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
