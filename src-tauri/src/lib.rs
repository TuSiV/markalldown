use std::hash::{BuildHasher, Hash, Hasher, RandomState};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

struct AppState {
    sidecar_port: Mutex<u16>,
    api_token: Mutex<String>,
    sidecar_child: Mutex<Option<Child>>,
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

fn find_sidecar(_app: &AppHandle) -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe().unwrap_or_default();
    let exe_dir = exe_path.parent().unwrap_or(std::path::Path::new(".")).to_path_buf();

    // 安装后 / 打包后：sidecar 与主程序同目录
    let exe_stem = exe_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "markitdown-open".into());
    let sibling_names = [
        "markalldown-server.exe".to_string(),
        format!("{}-server.exe", exe_stem),
    ];

    for name in &sibling_names {
        let candidate = exe_dir.join(name);
        if candidate.exists() {
            log::info!("Found sidecar at: {:?}", candidate);
            return Ok(candidate);
        }
    }

    // 开发模式：仓库内 binaries / backend/dist
    if let Some(project_root) = option_env!("CARGO_MANIFEST_DIR") {
        let root = PathBuf::from(project_root);
        for candidate in [
            root.join("binaries/markalldown-server-x86_64-pc-windows-msvc.exe"),
            root.join("../backend/dist/markalldown-server.exe"),
        ] {
            if candidate.exists() {
                log::info!("Found sidecar at: {:?}", candidate);
                return Ok(candidate);
            }
        }
    }

    Err("Sidecar binary not found".to_string())
}

fn start_sidecar(app: &AppHandle) -> Result<(u16, String), String> {
    let port = pick_port();
    let token = generate_token();
    let sidecar_path = find_sidecar(app)?;

    let child = Command::new(&sidecar_path)
        .args(["--port", &port.to_string(), "--token", &token])
        .current_dir(sidecar_path.parent().unwrap_or(std::path::Path::new(".")))
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

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

        let _ = child.kill();
        let _ = child.wait();
        log::info!("Sidecar stopped");
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
        })
        .invoke_handler(tauri::generate_handler![get_connection_info])
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
