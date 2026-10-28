use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::Mutex,
};
use tauri::{Manager, State};

struct Worker {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    next_id: u64,
}

impl Worker {
    fn spawn(app: &tauri::AppHandle) -> Result<Self, String> {
        let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let mut command;
        if cfg!(debug_assertions) {
            let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .to_path_buf();
            let venv = workspace.join(if cfg!(windows) {
                ".venv-media/Scripts/python.exe"
            } else {
                ".venv-media/bin/python"
            });
            let python = std::env::var_os("DTAPP_PYTHON")
                .map(PathBuf::from)
                .unwrap_or_else(|| {
                    if venv.exists() {
                        venv
                    } else {
                        PathBuf::from("python")
                    }
                });
            command = Command::new(python);
            command.arg(workspace.join("desktop/engine.py"));
        } else {
            let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
            let architecture = std::env::consts::ARCH;
            let name = if cfg!(windows) {
                "dt-media-engine.exe"
            } else {
                "dt-media-engine"
            };
            command = Command::new(
                resources
                    .join("worker-runtime")
                    .join(architecture)
                    .join("dt-media-engine")
                    .join(name),
            );
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.args(["--data-dir", &root.to_string_lossy(), "--require-google"])
            .env("PYTHONIOENCODING", "utf-8").stdin(Stdio::piped()).stdout(Stdio::piped())
            .stderr(Stdio::inherit()).spawn().map_err(|e| format!("Không khởi động được bộ xử lý media: {e}. Chạy npm run desktop:setup khi phát triển."))?;
        let input = child.stdin.take().ok_or("Worker stdin unavailable")?;
        let output = BufReader::new(child.stdout.take().ok_or("Worker stdout unavailable")?);
        Ok(Self {
            child,
            input,
            output,
            next_id: 0,
        })
    }

    fn request(
        &mut self,
        command: &str,
        payload: Value,
        access_token: Option<&str>,
    ) -> Result<Value, String> {
        self.next_id += 1;
        let request = json!({"id": self.next_id, "command": command, "payload": payload, "accessToken":access_token});
        writeln!(self.input, "{request}")
            .and_then(|_| self.input.flush())
            .map_err(|e| e.to_string())?;
        let mut line = String::new();
        if self
            .output
            .read_line(&mut line)
            .map_err(|e| e.to_string())?
            == 0
        {
            return Err("Bộ xử lý media đã dừng. Đóng và mở lại ứng dụng.".into());
        }
        let reply: Value =
            serde_json::from_str(&line).map_err(|_| "Bộ xử lý media trả dữ liệu không hợp lệ.")?;
        if reply["id"].as_u64() != Some(self.next_id) {
            return Err("Worker response mismatch".into());
        }
        if let Some(error) = reply["error"].as_str() {
            return Err(error.into());
        }
        Ok(reply["result"].clone())
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        let _ = self.request("shutdown", json!({}), None);
        // Give Chromium, FFmpeg and the SQLite writer time to close cleanly.
        for _ in 0..50 {
            if self.child.try_wait().ok().flatten().is_some() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

struct MediaState(Mutex<Option<Worker>>);

#[tauri::command]
async fn media_request(
    app: tauri::AppHandle,
    state: State<'_, MediaState>,
    command: String,
    payload: Value,
    access_token: Option<String>,
) -> Result<Value, String> {
    const ALLOWED: &[&str] = &[
        "snapshot",
        "heartbeat",
        "lock_session",
        "save_channel",
        "remove_channel",
        "save_settings",
        "monitor",
        "scan",
        "search",
        "download",
        "dub",
        "transcribe",
        "transcript_result",
        "install_asr",
        "cancel",
        "retry",
        "open_guest",
        "close_guest",
        "install_browser",
        "install_voice",
    ];
    if !ALLOWED.contains(&command.as_str()) {
        return Err("Lệnh không được hỗ trợ.".into());
    }
    let app_clone = app.clone();
    // Blocking stdio belongs off the UI thread; the worker only queues long-running tasks.
    let _ = state;
    tauri::async_runtime::spawn_blocking(move || {
        let shared = app_clone.state::<MediaState>();
        let mut guard = shared.0.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            *guard = Some(Worker::spawn(&app_clone)?);
        }
        guard
            .as_mut()
            .unwrap()
            .request(&command, payload, access_token.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn validate_oauth_url(url: String) -> Result<String, String> {
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https"
        || !parsed.host_str().unwrap_or("").ends_with(".supabase.co")
        || parsed.path() != "/auth/v1/authorize"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Untrusted sign-in URL".into());
    }
    Ok(parsed.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(MediaState(Mutex::new(None)))
        .setup(|app| {
            #[cfg(all(debug_assertions, target_os = "windows"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            use tauri::{
                menu::{Menu, MenuItem},
                tray::TrayIconBuilder,
            };
            let show = MenuItem::with_id(app, "show", "Mở DT App", true, None::<&str>)?;
            let quit = MenuItem::with_id(
                app,
                "quit",
                "Thoát DT App (dừng theo dõi)",
                true,
                None::<&str>,
            )?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::with_id("dtapp-tray")
                .tooltip("DT App — theo dõi Douyin khi chạy nền")
                .menu(&menu);
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => app.exit(0),
                _ => (),
            })
            .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![media_request, validate_oauth_url])
        .build(tauri::generate_context!())
        .expect("DT App could not start")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let shared = app.state::<MediaState>();
                if let Ok(mut worker) = shared.0.lock() {
                    drop(worker.take());
                };
            }
        });
}
