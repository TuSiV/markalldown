use std::sync::Mutex;
use std::process::{Command, Child};
use std::path::PathBuf;
use tauri::{Manager, AppHandle};

struct AppState {
    sidecar_port: Mutex<u16>,
    sidecar_child: Mutex<Option<Child>>,
}

#[tauri::command]
fn get_port(state: tauri::State<AppState>) -> u16 {
    *state.sidecar_port.lock().unwrap()
}

fn find_sidecar(app: &AppHandle) -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe().unwrap_or_default();
    let exe_dir = exe_path.parent().unwrap_or(std::path::Path::new("."));
    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    
    let possible_paths = vec![
        exe_dir.join("binaries/markitdown-server-x86_64-pc-windows-msvc.exe"),
        exe_dir.join("markitdown-server-x86_64-pc-windows-msvc.exe"),
        project_root.join("binaries/markitdown-server-x86_64-pc-windows-msvc.exe"),
        project_root.join("../backend/dist/markitdown-server.exe"),
    ];
    
    for path in &possible_paths {
        if path.exists() {
            log::info!("Found sidecar at: {:?}", path);
            return Ok(path.clone());
        }
    }
    
    Err("Sidecar binary not found".to_string())
}

fn start_sidecar(app: &AppHandle) -> Result<u16, String> {
    let port = 18765u16;
    let sidecar_path = find_sidecar(app)?;
    
    let child = Command::new(&sidecar_path)
        .args(["--port", &port.to_string()])
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;
    
    log::info!("Sidecar started, PID: {}", child.id());
    
    let state = app.state::<AppState>();
    *state.sidecar_child.lock().unwrap() = Some(child);
    
    Ok(port)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            sidecar_port: Mutex::new(18765),
            sidecar_child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![get_port])
        .setup(|app| {
            log::info!("MarkItDown starting...");
            
            match start_sidecar(&app.handle()) {
                Ok(port) => {
                    log::info!("Sidecar started on port {}", port);
                    let state = app.state::<AppState>();
                    *state.sidecar_port.lock().unwrap() = port;
                }
                Err(e) => {
                    log::error!("Sidecar failed: {}", e);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
