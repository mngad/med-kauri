import { initEditor, getEditorContent, onEditorChange, setEditorContent } from "./editor";
import { updatePreview } from "./preview";
import { setupToolbar } from "./toolbar";
import { setupBridge } from "./bridge";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTabsEnabled, handleFileOpen, requestTabSwitch } from "./tab-bridge";

// State
let currentFilePath: string | null = null;
let isDirty: boolean = false;
export let currentMode: "split" | "preview" | "editor" = "preview";

export function getFilePath(): string | null { return currentFilePath; }
export function getIsDirty(): boolean { return isDirty; }

export function setDirty(dirty: boolean) {
  isDirty = dirty;
  updateTitle();
}

export function setFilePath(path: string | null) {
  currentFilePath = path;
  updateTitle();
}

export function updateTitle() {
  const filename = currentFilePath
    ? currentFilePath.split("/").pop() || currentFilePath
    : "Untitled";
  const dirty = isDirty ? "• " : "";
  document.title = `${dirty}${filename} — med`;
}

// Debounced preview update
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedUpdatePreview() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const content = getEditorContent();
    updatePreview(content);
    updateStatusBar();
  }, 150);
}

// Sync scroll
let syncing = false;
function setupSyncScroll() {
  const previewEl = document.getElementById("preview-pane");
  if (!previewEl) {
    setTimeout(setupSyncScroll, 200);
    return;
  }

  const cmScroller = document.querySelector(".cm-scroller");
  if (!cmScroller) {
    setTimeout(setupSyncScroll, 200);
    return;
  }

  cmScroller.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    const maxScroll = cmScroller.scrollHeight - cmScroller.clientHeight;
    const ratio = maxScroll > 0 ? cmScroller.scrollTop / maxScroll : 0;
    const previewMax = previewEl.scrollHeight - previewEl.clientHeight;
    previewEl.scrollTop = ratio * previewMax;
    syncing = false;
  });

  previewEl.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    const maxScroll = previewEl.scrollHeight - previewEl.clientHeight;
    const ratio = maxScroll > 0 ? previewEl.scrollTop / maxScroll : 0;
    const editorMax = cmScroller.scrollHeight - cmScroller.clientHeight;
    cmScroller.scrollTop = ratio * editorMax;
    syncing = false;
  });
}

export function setMode(mode: "split" | "preview" | "editor") {
  currentMode = mode;
  const app = document.getElementById("app")!;
  app.classList.remove("mode-split", "mode-preview-only", "mode-editor-only");
  app.classList.add(`mode-${mode === "preview" ? "preview-only" : mode === "editor" ? "editor-only" : "split"}`);
}

// Divider drag to resize panes
function setupDividerDrag() {
  const divider = document.getElementById("divider")!;
  const mainContent = document.getElementById("main-content")!;
  let dragging = false;

  divider.addEventListener("mousedown", (e) => {
    if (currentMode !== "split") return;
    dragging = true;
    divider.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = mainContent.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(20, Math.min(80, (x / rect.width) * 100));
    mainContent.style.gridTemplateColumns = `${pct}% 4px ${100 - pct}%`;
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
}

// Status bar word/char count
function updateStatusBar() {
  const content = getEditorContent();
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const chars = content.length;
  document.getElementById("status-words")!.textContent = `${words} words`;
  document.getElementById("status-chars")!.textContent = `${chars} chars`;
}

// Window edge resize
function setupEdgeResize() {
  const edgeSize = 4;
  document.addEventListener("mousemove", (e) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    const onLeft = clientX <= edgeSize;
    const onRight = clientX >= innerWidth - edgeSize;
    const onTop = clientY <= edgeSize;
    const onBottom = clientY >= innerHeight - edgeSize;

    let cursor = "";
    if ((onLeft && onTop) || (onRight && onBottom)) cursor = "nwse-resize";
    else if ((onLeft && onBottom) || (onRight && onTop)) cursor = "nesw-resize";
    else if (onLeft || onRight) cursor = "ew-resize";
    else if (onTop || onBottom) cursor = "ns-resize";
    document.body.style.cursor = cursor || "";
  });
}

// Keyboard shortcuts for toolbar / statusbar / modes
function setupKeyboardShortcuts() {
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;

    switch (e.key) {
      case "t":
        if (e.shiftKey) {
          e.preventDefault();
          toggleToolbar();
        } else if (isTabsEnabled()) {
          e.preventDefault();
          requestTabSwitch("new");
        }
        break;
      case "s":
        if (e.shiftKey) {
          e.preventDefault();
          toggleStatusbar();
        }
        break;
      case "1":
        e.preventDefault();
        setMode("split");
        break;
      case "2":
        e.preventDefault();
        setMode("preview");
        break;
      case "3":
        e.preventDefault();
        setMode("editor");
        break;
      case "w":
        e.preventDefault();
        e.stopPropagation();
        if (isTabsEnabled()) {
          (window as any).__medClose();
        } else {
          getCurrentWindow().destroy();
        }
        break;
      case "[":
        if (isTabsEnabled()) {
          e.preventDefault();
          requestTabSwitch("prev");
        }
        break;
      case "]":
        if (isTabsEnabled()) {
          e.preventDefault();
          requestTabSwitch("next");
        }
        break;
    }
  }, true);  // capture phase — fires before CodeMirror
}

function toggleToolbar() {
  const toolbar = document.getElementById("toolbar")!;
  toolbar.style.display = toolbar.style.display === "none" ? "" : "none";
}

function toggleStatusbar() {
  const statusbar = document.getElementById("statusbar")!;
  statusbar.style.display = statusbar.style.display === "none" ? "" : "none";
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initEditor(document.getElementById("editor")!);
  setupToolbar();
  setupBridge();
  setupSyncScroll();
  setupDividerDrag();
  setupEdgeResize();
  setupKeyboardShortcuts();

  // Apply default mode (preview-only)
  setMode(currentMode);

  // Check for file loaded via initialization script (new window from Finder)
  const initFile = (window as any).__initialFile;
  if (initFile && initFile.content) {
    if (isTabsEnabled()) {
      handleFileOpen(initFile.path, initFile.content);
    } else {
      setEditorContent(initFile.content);
      if (initFile.path) setFilePath(initFile.path);
      setDirty(false);
    }
  }

  onEditorChange(() => {
    setDirty(true);
    debouncedUpdatePreview();
  });

  // Initial preview
  updatePreview(getEditorContent());
  updateStatusBar();
  setDirty(false);
});
