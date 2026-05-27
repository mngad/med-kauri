use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

#[derive(Debug, Default)]
struct StartupFile {
    path: Mutex<Option<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Settings {
    theme: String,
    editor_font: String,
    editor_size: u32,
    preview_font: String,
    preview_size: u32,
    tabs_enabled: bool,
    window_x: Option<f64>,
    window_y: Option<f64>,
    window_w: Option<f64>,
    window_h: Option<f64>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "light".into(),
            editor_font: "JetBrains Mono".into(),
            editor_size: 13,
            preview_font: "-apple-system, BlinkMacSystemFont, 'Segoe UI'".into(),
            preview_size: 16,
            tabs_enabled: false,
            window_x: None,
            window_y: None,
            window_w: None,
            window_h: None,
        }
    }
}

fn settings_path() -> PathBuf {
    dirs_next()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("med")
        .join("settings.json")
}

fn dirs_next() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join("Library").join("Application Support"))
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var("XDG_CONFIG_HOME")
            .ok()
            .map(PathBuf::from)
            .or_else(|| std::env::var("HOME").ok().map(|h| PathBuf::from(h).join(".config")))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA").ok().map(PathBuf::from)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

fn load_settings() -> Settings {
    let path = settings_path();
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(s) = serde_json::from_str(&content) {
                return s;
            }
        }
    }
    Settings::default()
}

fn save_settings(settings: &Settings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings() -> Settings {
    load_settings()
}

#[tauri::command]
fn update_settings(settings: Settings) -> Result<(), String> {
    save_settings(&settings)
}

#[tauri::command]
fn get_startup_file(state: tauri::State<StartupFile>) -> Option<String> {
    state.path.lock().unwrap().clone()
}

fn create_file_window(
    app: &tauri::AppHandle,
    path: &str,
) -> Result<tauri::WebviewWindow, tauri::Error> {
    let p = std::path::PathBuf::from(path);
    let content = std::fs::read_to_string(&p).unwrap_or_default();
    let fname = p.file_name().unwrap_or_default().to_string_lossy().to_string();
    let content_json = serde_json::to_string(&content).unwrap_or_default();
    let path_json = serde_json::to_string(&p.to_string_lossy()).unwrap_or_default();
    let init_script = format!(
        "window.__initialFile = {{ path: {}, content: {} }};",
        path_json, content_json
    );
    let label = format!("file-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());
    tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("index.html".into()))
        .title(fname)
        .inner_size(1200.0, 800.0)
        .min_inner_size(400.0, 300.0)
        .center()
        .initialization_script(&init_script)
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            open_file,
            save_file,
            get_settings,
            update_settings,
            get_startup_file
        ])
        .manage(StartupFile::default())
        .manage(std::sync::Arc::new(AtomicBool::new(false)))
        .setup(|app| {
            // ---- Build menus (no windows yet) ----
            let split_view = MenuItemBuilder::with_id("split_view", "Split View")
                .accelerator("CmdOrCtrl+1")
                .build(app)?;
            let preview_only = MenuItemBuilder::with_id("preview_only", "Preview Only")
                .accelerator("CmdOrCtrl+2")
                .build(app)?;
            let focus_mode = MenuItemBuilder::with_id("focus_mode", "Focus Mode")
                .accelerator("CmdOrCtrl+3")
                .build(app)?;
            let toggle_toolbar = MenuItemBuilder::with_id("toggle_toolbar", "Toggle Toolbar")
                .accelerator("CmdOrCtrl+Shift+T")
                .build(app)?;
            let toggle_statusbar = MenuItemBuilder::with_id("toggle_statusbar", "Toggle Status Bar")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?;
            let toggle_theme = MenuItemBuilder::with_id("toggle_theme", "Toggle Dark/Light Theme")
                .accelerator("CmdOrCtrl+Shift+L")
                .build(app)?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&split_view)
                .item(&preview_only)
                .item(&focus_mode)
                .separator()
                .item(&toggle_toolbar)
                .item(&toggle_statusbar)
                .item(&toggle_theme)
                .build()?;

            let close_window = MenuItemBuilder::with_id("close_window", "Close Window")
                .accelerator("CmdOrCtrl+W")
                .build(app)?;
            let open_file_menu = MenuItemBuilder::with_id("open", "Open…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let save_file_menu = MenuItemBuilder::with_id("save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let prefs_menu = MenuItemBuilder::with_id("preferences", "Preferences…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&open_file_menu)
                .item(&save_file_menu)
                .separator()
                .item(&close_window)
                .separator()
                .item(&prefs_menu)
                .separator()
                .quit()
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .build()?;

            app.set_menu(menu)?;

            // ---- Store CLI arg for later use (frontend will request it) ----
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let file_path = args[1].clone();
                if std::fs::metadata(&file_path).is_ok() {
                    let state = app.state::<StartupFile>();
                    *state.path.lock().unwrap() = Some(file_path);
                }
            }

            // ---- Menu actions ----
            app.on_menu_event(move |ah, event| {
                let id = event.id().0.as_str();
                if id == "close_window" {
                    if let Some(focused) = ah.get_focused_window() {
                        if let Some(ww) = ah.get_webview_window(focused.label()) {
                            let _ = ww.destroy();
                        }
                    }
                    return;
                }
                let js = match id {
                    "open" => "window.__medAction('open')",
                    "save" => "window.__medAction('save')",
                    "preferences" => "window.__medAction('preferences')",
                    "split_view" => "window.__medAction('split-view')",
                    "preview_only" => "window.__medAction('preview-only')",
                    "focus_mode" => "window.__medAction('focus-mode')",
                    "toggle_toolbar" => "window.__medAction('toggle-toolbar')",
                    "toggle_statusbar" => "window.__medAction('toggle-statusbar')",
                    "toggle_theme" => "window.__medAction('toggle-theme')",
                    _ => return,
                };
                // Try focused window first, fallback to main, then any window
                let target = ah.get_focused_window()
                    .and_then(|w| ah.get_webview_window(w.label()))
                    .or_else(|| ah.get_webview_window("main"))
                    .or_else(|| ah.webview_windows().into_values().next());
                if let Some(ww) = target {
                    let _ = ww.eval(js);
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match event {
                tauri::RunEvent::Ready => {
                    let has_startup = app_handle
                        .state::<StartupFile>()
                        .path.lock().unwrap()
                        .is_some();
                    let has_finder_file = app_handle
                        .try_state::<std::sync::Arc<AtomicBool>>()
                        .map(|f| f.load(std::sync::atomic::Ordering::Relaxed))
                        .unwrap_or(false);
                    if !has_startup && !has_finder_file {
                        let _ = tauri::WebviewWindowBuilder::new(
                            app_handle,
                            "main",
                            tauri::WebviewUrl::App("index.html".into()),
                        )
                        .title("med")
                        .inner_size(1200.0, 800.0)
                        .min_inner_size(400.0, 300.0)
                        .center()
                        .build();
                    }
                    // Push settings
                    let settings = load_settings();
                    if let Some(w) = app_handle.get_webview_window("main") {
                        if let Ok(json) = serde_json::to_string(&settings) {
                            let _ = w.eval(&format!("window.__medSettings({});", json));
                        }
                    }
                }
                tauri::RunEvent::Opened { urls } => {
                    if let Some(flag) = app_handle
                        .try_state::<std::sync::Arc<AtomicBool>>()
                    {
                        flag.store(true, std::sync::atomic::Ordering::Relaxed);
                    }
                    let settings = load_settings();
                    let _ = std::fs::write("/tmp/med-tabs.log",
                        format!("tabs_enabled={} win_count={}",
                            settings.tabs_enabled,
                            app_handle.webview_windows().len()));
                    for url in urls.iter() {
                        let decoded = urlencoding::decode(url.path())
                            .map(|s| s.into_owned())
                            .unwrap_or_else(|_| url.path().to_string());
                        let path = std::path::PathBuf::from(&decoded);
                        if settings.tabs_enabled {
                            // Send file to an existing window if any
                            if let Ok(content) = std::fs::read_to_string(&path) {
                                let content_json = serde_json::to_string(&content).unwrap_or_default();
                                let path_json = serde_json::to_string(&path.to_string_lossy()).unwrap_or_default();
                                let js = format!(
                                    "window.__medOpenFile({}, {});",
                                    path_json, content_json
                                );
                                // Try main, then any available window
                                let target = app_handle
                                    .get_webview_window("main")
                                    .or_else(|| app_handle.webview_windows().into_values().next());
                                if let Some(w) = target {
                                    let _ = w.eval(&js);
                                } else {
                                    let _ = create_file_window(app_handle, &decoded);
                                }
                            }
                        } else {
                            let _ = create_file_window(app_handle, &decoded);
                        }
                    }
                }
                _ => {}
            }
        });
}
