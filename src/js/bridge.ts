import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setFilePath, setDirty, setMode, getIsDirty, getFilePath } from "./main";
import { setEditorContent, getEditorContent, setEditorTheme } from "./editor";
import { showPreferences, getSettings, setSettings, applySettings } from "./preferences";
import { ensureTabsInited, handleFileOpen, saveCurrentTab, requestTabSwitch } from "./tab-bridge";
import { initTabBar } from "./tab-bar";
import { tabManager } from "./tabs";

// Lazy-load dialog plugin (must be after Tauri runtime is ready)
async function getDialog() {
  return await import("@tauri-apps/plugin-dialog");
}

// ---- Globals called by Rust via eval() ----

(window as any).__medAction = (action: string) => {
  const show = (msg: string) => {
    let el = document.getElementById("debug-overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "debug-overlay";
      el.style.cssText = "position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.9);color:#0f0;padding:12px;border-radius:6px;font:11px monospace;z-index:99999;max-width:400px;white-space:pre-wrap";
      document.body.appendChild(el);
    }
    el.textContent += msg + "\n";
  };
  show(">>> " + action);
  switch (action) {
    case "split-view":   setMode("split");   break;
    case "preview-only": setMode("preview"); break;
    case "focus-mode":   setMode("editor");  break;
    case "open":
      openFile().catch((e: any) => {
        const el = document.getElementById("debug-overlay");
        if (el) el.textContent += "PROMISE ERROR: " + e + "\n";
      });
      break;
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
      theme: s.theme,
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

(window as any).__medOpenFile = (path: string, content: string) => {
  handleFileOpen(path, content);
};

// ---- Actions ----

export async function openFile() {
  const log = (msg: string) => {
    const el = document.getElementById("debug-overlay");
    if (el) el.textContent += msg + "\n";
  };
  log("STEP1: openFile() entered");

  try {
    saveCurrentTab();
    const dirty = getIsDirty();
    log("STEP2: dirty=" + dirty);
    if (dirty) {
      const confirmed = await confirmDiscard();
      if (!confirmed) { log("STEP2b: user cancelled"); return; }
    }

    log("STEP3: importing dialog...");
    const dialog = await getDialog();
    log("STEP4: dialog.type=" + typeof dialog.open);

    log("STEP5: calling dialog.open()...");
    const path = await dialog.open({
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      multiple: false,
    });
    log("STEP6: path=" + JSON.stringify(path));
    if (path) {
      log("STEP7: loading file...");
      const content = await invoke<string>("open_file", { path });
      log("STEP8: loaded " + content.length + " chars");
      handleFileOpen(path, content);
    }
  } catch (e: any) {
    log("ERROR: " + (e?.message || String(e)));
  }
}

export async function saveFile(): Promise<boolean> {
  try {
    saveCurrentTab();
    let path = getFilePath();
    if (!path) {
      const { save } = await getDialog();
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
    const s = getSettings();
    await invoke("update_settings", {
      settings: {
        theme: s.theme,
        editor_font: s.editorFont,
        editor_size: s.editorSize,
        preview_font: s.previewFont,
        preview_size: s.previewSize,
      },
    });
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

async function confirmDiscard(): Promise<boolean> {
  try {
    const { ask } = await getDialog();
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
  saveCurrentTab();
  const active = tabManager.getActive();

  if (tabManager.tabs.length <= 1) {
    if (active && active.isDirty) {
      try {
        const { ask } = await getDialog();
        const shouldSave = await ask("You have unsaved changes. Save before closing?", {
          title: "Unsaved Changes",
          kind: "warning",
        });
        if (shouldSave) {
          const saved = await saveFile();
          if (!saved) return;
        }
      } catch { /* allow closing */ }
    }
    await persistSettings();
    await getCurrentWindow().destroy();
    return;
  }

  // Multiple tabs: close just the active tab
  if (active && active.isDirty) {
    try {
      const { ask } = await getDialog();
      const shouldSave = await ask("You have unsaved changes. Save before closing?", {
        title: "Unsaved Changes",
        kind: "warning",
      });
      if (shouldSave) {
        const saved = await saveFile();
        if (!saved) return;
      }
    } catch { /* allow closing */ }
  }
  await requestTabSwitch("close", tabManager.activeTabId!);
}

// ---- Bootstrap ----

export function setupBridge() {
  initTabBar();

  // Request startup file from Rust (set via CLI arg)
  invoke<string | null>("get_startup_file", {}).then((filePath) => {
    if (filePath) {
      invoke<string>("open_file", { path: filePath }).then((content) => {
        setEditorContent(content);
        setFilePath(filePath);
        setDirty(false);
        ensureTabsInited();
      });
    } else {
      ensureTabsInited();
    }
  });
}
