#![allow(unexpected_cfgs)]

use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty};
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::Manager;
use uuid::Uuid;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl, class};

struct PtySession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
}

struct AppState {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

#[derive(Clone, Serialize)]
struct PtyOutputPayload {
    session_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize, Deserialize)]
struct RunningApp {
    name: String,
    bundle_id: String,
}

#[derive(Clone, Serialize)]
struct FocusChangedPayload {
    focused_app: String,
    is_target_focused: bool,
    is_self_focused: bool,
}

// Global flag to control focus monitoring
static FOCUS_MONITOR_ACTIVE: AtomicBool = AtomicBool::new(false);
static FOCUS_MONITOR_TARGET: Mutex<Option<String>> = Mutex::new(None);

#[cfg(target_os = "macos")]
fn get_frontmost_app_name() -> Option<String> {
    unsafe {
        let workspace: *mut objc::runtime::Object = msg_send![class!(NSWorkspace), sharedWorkspace];
        let frontmost_app: *mut objc::runtime::Object = msg_send![workspace, frontmostApplication];
        if frontmost_app.is_null() {
            return None;
        }
        let name: *mut objc::runtime::Object = msg_send![frontmost_app, localizedName];
        if name.is_null() {
            return None;
        }
        let utf8: *const i8 = msg_send![name, UTF8String];
        if utf8.is_null() {
            return None;
        }
        Some(std::ffi::CStr::from_ptr(utf8).to_string_lossy().into_owned())
    }
}

#[cfg(not(target_os = "macos"))]
fn get_frontmost_app_name() -> Option<String> {
    None
}

#[cfg(target_os = "macos")]
fn get_running_applications() -> Vec<RunningApp> {
    unsafe {
        let workspace: *mut objc::runtime::Object = msg_send![class!(NSWorkspace), sharedWorkspace];
        let apps: *mut objc::runtime::Object = msg_send![workspace, runningApplications];
        let count: usize = msg_send![apps, count];

        let mut result = Vec::new();

        for i in 0..count {
            let app: *mut objc::runtime::Object = msg_send![apps, objectAtIndex: i];

            // Check if it's a regular app (not background)
            let activation_policy: i64 = msg_send![app, activationPolicy];
            if activation_policy != 0 {
                continue; // Skip non-regular apps
            }

            let name: *mut objc::runtime::Object = msg_send![app, localizedName];
            let bundle_id: *mut objc::runtime::Object = msg_send![app, bundleIdentifier];

            if name.is_null() {
                continue;
            }

            let name_utf8: *const i8 = msg_send![name, UTF8String];
            let name_str = if !name_utf8.is_null() {
                std::ffi::CStr::from_ptr(name_utf8).to_string_lossy().into_owned()
            } else {
                continue;
            };

            let bundle_str = if !bundle_id.is_null() {
                let bundle_utf8: *const i8 = msg_send![bundle_id, UTF8String];
                if !bundle_utf8.is_null() {
                    std::ffi::CStr::from_ptr(bundle_utf8).to_string_lossy().into_owned()
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            result.push(RunningApp {
                name: name_str,
                bundle_id: bundle_str,
            });
        }

        // Sort by name
        result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        result
    }
}

#[cfg(not(target_os = "macos"))]
fn get_running_applications() -> Vec<RunningApp> {
    Vec::new()
}

#[tauri::command]
fn get_running_apps() -> Vec<RunningApp> {
    get_running_applications()
}

#[tauri::command]
fn get_frontmost_app() -> Option<String> {
    get_frontmost_app_name()
}

#[tauri::command]
fn start_focus_monitor(app_handle: tauri::AppHandle, target_app: String) {
    // Set the target and activate monitoring
    if let Ok(mut target) = FOCUS_MONITOR_TARGET.lock() {
        *target = Some(target_app.clone());
    }

    // If already running, just update target
    if FOCUS_MONITOR_ACTIVE.load(Ordering::SeqCst) {
        return;
    }

    FOCUS_MONITOR_ACTIVE.store(true, Ordering::SeqCst);

    thread::spawn(move || {
        let mut last_app: Option<String> = None;

        while FOCUS_MONITOR_ACTIVE.load(Ordering::SeqCst) {
            if let Some(current_app) = get_frontmost_app_name() {
                // Only emit if changed
                if last_app.as_ref() != Some(&current_app) {
                    last_app = Some(current_app.clone());

                    let target = FOCUS_MONITOR_TARGET.lock()
                        .ok()
                        .and_then(|t| t.clone());

                    if let Some(target_name) = target {
                        let is_self = current_app == "Shelll" || current_app == "shelll";
                        let is_target = current_app == target_name;

                        let payload = FocusChangedPayload {
                            focused_app: current_app,
                            is_target_focused: is_target,
                            is_self_focused: is_self,
                        };

                        let _ = app_handle.emit_all("app-focus-changed", payload);
                    }
                }
            }

            thread::sleep(Duration::from_millis(200));
        }
    });
}

#[tauri::command]
fn stop_focus_monitor() {
    FOCUS_MONITOR_ACTIVE.store(false, Ordering::SeqCst);
    if let Ok(mut target) = FOCUS_MONITOR_TARGET.lock() {
        *target = None;
    }
}

#[tauri::command]
fn create_pty_session(app_handle: tauri::AppHandle, state: tauri::State<AppState>) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();

    let pty_system = NativePtySystem::default();
    let mut cmd = CommandBuilder::new("zsh");
    cmd.env("TERM", "xterm-256color");
    cmd.args(["-c", "export PROMPT_EOL_MARK=''; exec zsh"]);

    if let Ok(cwd) = env::current_dir() {
        cmd.cwd(cwd);
    }

    let pair = pty_system.openpty(PtySize {
        rows: 30,
        cols: 100,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| format!("Failed to create PTY: {}", e))?;

    let mut reader = pair.master.try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;
    let writer = pair.master.take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;

    // Spawn shell
    let child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;
    // Keep child alive
    Box::leak(Box::new(child));

    let session = PtySession {
        writer: Arc::new(Mutex::new(writer)),
        master: Arc::new(Mutex::new(pair.master)),
    };

    // Store session
    {
        let mut sessions = state.sessions.lock().map_err(|_| "Lock poisoned")?;
        sessions.insert(session_id.clone(), session);
    }

    // Read thread for this session
    let sid = session_id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let payload = PtyOutputPayload {
                        session_id: sid.clone(),
                        data: buf[..n].to_vec(),
                    };
                    let _ = app_handle.emit_all("pty-output", payload);
                }
                Ok(_) => break, // EOF
                Err(_) => break, // Error
            }
        }
    });

    Ok(session_id)
}

#[tauri::command]
fn write_to_pty(session_id: String, data: String, state: tauri::State<AppState>) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|_| "Lock poisoned")?;
    if let Some(session) = sessions.get(&session_id) {
        if let Ok(mut writer) = session.writer.lock() {
            // Write raw bytes directly, don't use write! macro formatting
            let _ = writer.write_all(data.as_bytes());
            let _ = writer.flush();
        }
    }
    Ok(())
}

#[tauri::command]
fn resize_pty(session_id: String, rows: u16, cols: u16, state: tauri::State<AppState>) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|_| "Lock poisoned")?;
    if let Some(session) = sessions.get(&session_id) {
        if let Ok(master) = session.master.lock() {
            let _ = master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
    }
    Ok(())
}

#[tauri::command]
fn close_pty_session(session_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|_| "Lock poisoned")?;
    sessions.remove(&session_id);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_window("main").unwrap();

            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
              .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

            app.manage(AppState {
                sessions: Arc::new(Mutex::new(HashMap::new())),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_pty_session,
            write_to_pty,
            resize_pty,
            close_pty_session,
            get_running_apps,
            get_frontmost_app,
            start_focus_monitor,
            stop_focus_monitor
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
