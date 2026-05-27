import { initEditor, getEditorContent, onEditorChange, setEditorContent } from "./editor";
import { updatePreview } from "./preview";
import { setupToolbar } from "./toolbar";
import { setupBridge } from "./bridge";
import { requestTabSwitch } from "./tab-bridge";

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

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedUpdatePreview() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    updatePreview(getEditorContent());
    updateStatusBar();
  }, 150);
}

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

function updateStatusBar() {
  const content = getEditorContent();
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const chars = content.length;
  document.getElementById("status-words")!.textContent = `${words} words`;
  document.getElementById("status-chars")!.textContent = `${chars} chars`;
}

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

function setupKeyboardShortcuts() {
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;

    switch (e.key) {
      case "t":
        if (e.shiftKey) {
          e.preventDefault();
          toggleToolbar();
        } else {
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
      case "o":
        e.preventDefault();
        import("./bridge").then((m) => m.openFile());
        break;
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
        (window as any).__medClose();
        break;
      case "[":
        e.preventDefault();
        requestTabSwitch("prev");
        break;
      case "]":
        e.preventDefault();
        requestTabSwitch("next");
        break;
    }
  }, true);
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

  setMode(currentMode);

  // Check for file loaded via initialization script
  const initFile = (window as any).__initialFile;
  if (initFile && initFile.content) {
    setEditorContent(initFile.content);
    if (initFile.path) setFilePath(initFile.path);
    setDirty(false);
    // Defer tab init until after content is set
    setTimeout(ensureTabsInit, 50);
  } else {
    ensureTabsInit();
  }

  onEditorChange(() => {
    setDirty(true);
    debouncedUpdatePreview();
  });

  updatePreview(getEditorContent());
  updateStatusBar();
  setDirty(false);
});

function ensureTabsInit() {
  import("./tab-bridge").then((m) => m.ensureTabsInited());
}
