import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";

export interface RunningApp {
  name: string;
  bundle_id: string;
}

interface FocusChangedPayload {
  focused_app: string;
  is_target_focused: boolean;
  is_self_focused: boolean;
}

export function useWindowAttachment() {
  const [attachedApp, setAttachedApp] = useState<RunningApp | null>(null);
  const [runningApps, setRunningApps] = useState<RunningApp[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch running applications
  const fetchRunningApps = useCallback(async () => {
    setIsLoading(true);
    try {
      const apps = await invoke<RunningApp[]>("get_running_apps");
      setRunningApps(apps);
    } catch (error) {
      console.error("Failed to fetch running apps:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Attach to an application
  const attachToApp = useCallback(async (app: RunningApp) => {
    setAttachedApp(app);
    try {
      await invoke("start_focus_monitor", { targetApp: app.name });
    } catch (error) {
      console.error("Failed to start focus monitor:", error);
      setAttachedApp(null);
    }
  }, []);

  // Detach from current application
  const detach = useCallback(async () => {
    setAttachedApp(null);
    try {
      await invoke("stop_focus_monitor");
      // Ensure window is visible when detaching
      await appWindow.show();
    } catch (error) {
      console.error("Failed to stop focus monitor:", error);
    }
  }, []);

  // Listen for focus change events
  useEffect(() => {
    if (!attachedApp) return;

    const unlisten = listen<FocusChangedPayload>("app-focus-changed", async (event) => {
      const { is_target_focused, is_self_focused } = event.payload;

      // Show window if target app or self is focused
      if (is_target_focused || is_self_focused) {
        await appWindow.show();
      } else {
        await appWindow.hide();
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [attachedApp]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (attachedApp) {
        invoke("stop_focus_monitor").catch(console.error);
      }
    };
  }, [attachedApp]);

  return {
    attachedApp,
    runningApps,
    isLoading,
    isAttached: attachedApp !== null,
    fetchRunningApps,
    attachToApp,
    detach,
  };
}
