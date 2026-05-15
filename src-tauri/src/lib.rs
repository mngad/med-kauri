use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
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
        .setup(|app| {
            let settings = load_settings();
            let window = app.get_webview_window("main").unwrap();
            let wev = window.clone();

            // ---- Build menus ----
            let split_view = MenuItemBuilder::with_id("split_view", "Split View")
                .accelerator("CmdOrCtrl+1")
                .build(app)?;
            let preview_only = MenuItemBuilder::with_id("preview_only", "Preview Only")
                .accelerator("CmdOrCtrl+2")
                .build(app)?;
            let focus_mode = MenuItemBuilder::with_id("focus_mode", "Focus Mode")
                .accelerator("CmdOrCtrl+3")
                .build(app)?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&split_view)
                .item(&preview_only)
                .item(&focus_mode)
                .separator()
                .text("toggle_toolbar", "Toggle Toolbar")
                .text("toggle_statusbar", "Toggle Status Bar")
                .text("toggle_theme", "Toggle Dark/Light Theme")
                .build()?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .text("open", "Open…")
                .text("save", "Save")
                .separator()
                .text("preferences", "Preferences…")
                .separator()
                .quit()
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .item(&view_menu)
                .build()?;

            app.set_menu(menu)?;

            // ---- Menu actions via eval (direct JS call, no events) ----
            let w = wev.clone();
            app.on_menu_event(move |_app_handle, event| {
                let id = event.id().0.as_str();
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
                let _ = w.eval(js);
            });

            // ---- Push settings to frontend via eval ----
            if let Ok(settings_json) = serde_json::to_string(&settings) {
                let js = format!(
                    "window.__medSettings({});",
                    settings_json
                );
                let _ = wev.eval(&js);
            }

            // ---- CLI file arg ----
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let file_path = args[1].clone();
                if std::fs::metadata(&file_path).is_ok() {
                    let state = app.state::<StartupFile>();
                    *state.path.lock().unwrap() = Some(file_path);
                }
            }

            // ---- Close event: save geometry, ask frontend to handle unsaved changes ----
            let w_close = wev.clone();
            wev.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    // Save window geometry
                    if let Ok(pos) = w_close.outer_position() {
                        let mut s = load_settings();
                        s.window_x = Some(pos.x as f64);
                        s.window_y = Some(pos.y as f64);
                        if let Ok(size) = w_close.outer_size() {
                            s.window_w = Some(size.width as f64);
                            s.window_h = Some(size.height as f64);
                        }
                        let _ = save_settings(&s);
                    }
                    // Let the window close normally
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
