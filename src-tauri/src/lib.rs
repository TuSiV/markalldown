mod appearance;

use std::hash::{BuildHasher, Hash, Hasher, RandomState};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

struct AppState {
    sidecar_port: Mutex<u16>,
    api_token: Mutex<String>,
    sidecar_child: Mutex<Option<Child>>,
    session_dir: Mutex<Option<PathBuf>>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ConnectionInfo {
    port: u16,
    token: String,
}

#[tauri::command]
fn get_connection_info(state: tauri::State<AppState>) -> ConnectionInfo {
    let port = *state.sidecar_port.lock().unwrap();
    let token = state.api_token.lock().unwrap().clone();
    ConnectionInfo { port, token }
}

fn generate_token() -> String {
    let state = RandomState::new();
    let mut h1 = state.build_hasher();
    std::time::SystemTime::now().hash(&mut h1);
    std::process::id().hash(&mut h1);
    let a = h1.finish();

    let mut h2 = state.build_hasher();
    a.hash(&mut h2);
    std::time::Instant::now().hash(&mut h2);
    let b = h2.finish();

    format!("{:016x}{:016x}", a, b)
}

fn pick_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(18765)
}

fn find_sidecar(app: &AppHandle) -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("Application directory unavailable")?;
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    let basename = format!("markalldown-server{}", suffix);
    let mut candidates = vec![exe_dir.join(&basename)];
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join(&basename));
        // Some macOS distributions place executable resources in MacOS.
        candidates.push(resources.join("../MacOS").join(&basename));
    }
    #[cfg(debug_assertions)]
    {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let target = env!("MARKALLDOWN_TARGET");
        candidates.push(root.join("binaries").join(format!("markalldown-server-{}{}", target, suffix)));
        candidates.push(root.join("../backend/dist").join(&basename));
    }
    for candidate in candidates {
        if candidate.is_file() {
            return candidate.canonicalize().map_err(|e| e.to_string());
        }
    }
    Err("Bundled conversion service not found".to_string())
}

fn start_sidecar(app: &AppHandle) -> Result<(u16, String), String> {
    let port = pick_port();
    let token = generate_token();
    let sidecar_path = find_sidecar(app)?;

    let session_dir = std::env::temp_dir().join(format!("markalldown-session-{}", generate_token()));
    std::fs::create_dir(&session_dir).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&session_dir, std::fs::Permissions::from_mode(0o700)).map_err(|error| error.to_string())?;
    }
    let mut command = Command::new(&sidecar_path);
    command.args(["--port", &port.to_string(), "--token", &token, "--session-dir", &session_dir.to_string_lossy()])
        .current_dir(sidecar_path.parent().unwrap_or(std::path::Path::new(".")));
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let child = command.spawn().map_err(|error| {
        let _ = std::fs::remove_dir_all(&session_dir);
        format!("Failed to spawn sidecar: {}", error)
    })?;
    *app.state::<AppState>().session_dir.lock().unwrap() = Some(session_dir);

    log::info!("Sidecar started, PID: {}, port: {}", child.id(), port);

    let state = app.state::<AppState>();
    *state.sidecar_child.lock().unwrap() = Some(child);
    *state.api_token.lock().unwrap() = token.clone();
    *state.sidecar_port.lock().unwrap() = port;

    Ok((port, token))
}

fn kill_sidecar(app: &AppHandle) {
    let child_opt = {
        let state = app.state::<AppState>();
        state
            .sidecar_child
            .lock()
            .ok()
            .and_then(|mut guard| guard.take())
    };

    if let Some(mut child) = child_opt {
        let pid = child.id();
        log::info!("Stopping sidecar PID {}", pid);

        // Windows: 先按进程树杀掉（覆盖 PyInstaller 派生子进程）
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
        }

        #[cfg(unix)]
        {
            // The dedicated group includes the frozen sidecar and every conversion worker.
            unsafe { libc::kill(-(pid as i32), libc::SIGTERM); }
            for _ in 0..30 {
                if matches!(child.try_wait(), Ok(Some(_))) { break; }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            unsafe { libc::kill(-(pid as i32), libc::SIGKILL); }
        }
        let _ = child.kill();
        let _ = child.wait();
        log::info!("Sidecar stopped");
    }
    let session = app.state::<AppState>().session_dir.lock().ok().and_then(|mut folder| folder.take());
    if let Some(directory) = session {
        if let Err(error) = std::fs::remove_dir_all(&directory) {
            if error.kind() != std::io::ErrorKind::NotFound { log::error!("Session cleanup failed: {}", error); }
        }
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            sidecar_port: Mutex::new(18765),
            api_token: Mutex::new(String::new()),
            sidecar_child: Mutex::new(None),
            session_dir: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![get_connection_info, appearance::get_desktop_appearance])
        .setup(|app| {
            log::info!("MarkAllDown starting...");

            match start_sidecar(&app.handle()) {
                Ok((port, token)) => {
                    log::info!("Sidecar started on port {}, token_len={}", port, token.len());
                }
                Err(e) => {
                    log::error!("Sidecar failed: {}", e);
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
            // 点窗口 X / 系统要求退出
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                kill_sidecar(app_handle);
            }
            // 主窗口销毁后回收，避免只挂钩 Exit 时漏掉
            tauri::RunEvent::WindowEvent {
                ref event,
                ..
            } if matches!(event, tauri::WindowEvent::Destroyed) => {
                kill_sidecar(app_handle);
            }
            _ => {}
        }
    });
}
