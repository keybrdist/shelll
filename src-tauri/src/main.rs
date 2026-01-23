use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty};
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::Manager;
use uuid::Uuid;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
use serde::Serialize;

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
            let _ = write!(writer, "{}", data);
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
            close_pty_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
