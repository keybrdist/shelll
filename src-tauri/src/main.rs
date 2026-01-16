use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::env;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::Manager;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

struct AppState {
    pty_writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

#[tauri::command]
fn write_to_pty(data: String, state: tauri::State<AppState>) {
    if let Ok(mut writer) = state.pty_writer.lock() {
        // We ignore errors for now (e.g. if pty closed)
        let _ = write!(writer, "{}", data);
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            
            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
              .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

            let pty_system = NativePtySystem::default();
            let mut cmd = CommandBuilder::new("zsh");
            cmd.env("TERM", "xterm-256color");
            // Disable ZSH auto-logout and unsetopt PROMPT_SP to fix '%' issue
            cmd.args(["-c", "export PROMPT_EOL_MARK=''; exec zsh"]);
            
            if let Ok(cwd) = env::current_dir() {
                cmd.cwd(cwd);
            }

            // Define initial size
            let pair = pty_system.openpty(PtySize {
                rows: 30,
                cols: 100,
                pixel_width: 0,
                pixel_height: 0,
            }).expect("Failed to create PTY");

            let mut reader = pair.master.try_clone_reader().expect("Failed to clone reader");
            let writer = pair.master.take_writer().expect("Failed to take writer");
            
            // Spawn shell
            let child = pair.slave.spawn_command(cmd).expect("Failed to spawn shell");
            // Keep child alive
            Box::leak(Box::new(child)); 

            let app_handle = app.app_handle();
            
            // Read thread
            thread::spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(n) if n > 0 => {
                            let data = buf[..n].to_vec();
                            // Send raw bytes to avoid splitting multi-byte UTF-8 characters
                            let _ = app_handle.emit_all("pty-output", data);
                        }
                        Ok(_) => break, // EOF
                        Err(_) => break, // Error
                    }
                }
            });

            app.manage(AppState {
                pty_writer: Arc::new(Mutex::new(writer)),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![write_to_pty])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
