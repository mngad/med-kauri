import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setFilePath, setDirty, setMode, getIsDirty, getFilePath } from "./main";
import { setEditorContent, getEditorContent, setEditorTheme } from "./editor";
import { showPreferences, getSettings, setSettings, applySettings } from "./preferences";

// ---- Globals called by Rust via eval() ----

(window as any).__medAction = (action: string) => {
  switch (action) {
    case "split-view":   setMode("split");   break;
    case "preview-only": setMode("preview"); break;
    case "focus-mode":   setMode("editor");  break;
    case "open":         openFile();         break;
    case "save":         saveFile();         break;
    case "preferences":  showPreferences();  break;
    case "toggle-toolbar":  toggleToolbar();  break;
    case "toggle-statusbar": toggleStatusbar(); break;
    case "toggle-theme":    toggleTheme();     break;
  }
};

(window as any).__medSettings = (json: any) => {
  const s = typeof json === "string" ? JSON.parse(json) : json;
  if (s) {
    setSettings({
      editorFont: s.editor_font,
      editorSize: s.editor_size,
      previewFont: s.preview_font,
      previewSize: s.preview_size,
    });
    if (s.theme === "dark") {
      document.documentElement.classList.add("dark");
      setEditorTheme(true);
    }
  }
  applySettings();
};

(window as any).__medClose = () => {
  handleCloseRequested();
};

// ---- Actions ----

export async function openFile() {
  try {
    if (getIsDirty()) {
      const confirmed = await confirmDiscard();
      if (!confirmed) return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      multiple: false,
    });
    if (path) {
      const content = await invoke<string>("open_file", { path });
      setEditorContent(content);
      setFilePath(path);
      setDirty(false);
    }
  } catch (e) {
    console.error("Failed to open file:", e);
  }
}

export async function saveFile(): Promise<boolean> {
  try {
    let path = getFilePath();
    if (!path) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const selected = await save({
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      });
      if (!selected) return false;
      path = selected;
    }
    const content = getEditorContent();
    await invoke("save_file", { path, content });
    setFilePath(path);
    setDirty(false);
    return true;
  } catch (e) {
    console.error("Failed to save file:", e);
    return false;
  }
}

async function persistSettings() {
  try {
    await invoke("update_settings", { settings: getSettings() });
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

async function confirmDiscard(): Promise<boolean> {
  try {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return await ask("You have unsaved changes. Discard them?", {
      title: "Unsaved Changes",
      kind: "warning",
    });
  } catch {
    return true;
  }
}

function toggleToolbar() {
  const toolbar = document.getElementById("toolbar")!;
  toolbar.style.display = toolbar.style.display === "none" ? "" : "none";
}

function toggleStatusbar() {
  const statusbar = document.getElementById("statusbar")!;
  statusbar.style.display = statusbar.style.display === "none" ? "" : "none";
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle("dark");
  setEditorTheme(isDark);
  const s = getSettings();
  s.theme = isDark ? "dark" : "light";
  setSettings(s);
  persistSettings();
}

async function handleCloseRequested() {
  if (getIsDirty()) {
    try {
      const { ask } = await import("@tauri-apps/plugin-dialog");
      const shouldSave = await ask("You have unsaved changes. Save before closing?", {
        title: "Unsaved Changes",
        kind: "warning",
      });
      if (shouldSave) {
        const saved = await saveFile();
        if (!saved) return;
      }
    } catch {
      // allow closing
    }
  }
  await persistSettings();
  await getCurrentWindow().destroy();
}

// ---- Bootstrap ----

export function setupBridge() {
  // Request startup file from Rust (set via CLI arg)
  invoke<string | null>("get_startup_file", {}).then((filePath) => {
    if (filePath) {
      invoke<string>("open_file", { path: filePath }).then((content) => {
        setEditorContent(content);
        setFilePath(filePath);
        setDirty(false);
      });
    }
  });
}
