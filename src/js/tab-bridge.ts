// Bridge between tab manager and the rest of the app
import { tabManager, findTabByPath } from "./tabs";
import { setTabBarVisible } from "./tab-bar";
import { getEditorContent, setEditorContent } from "./editor";
import { setFilePath, setDirty, getIsDirty, getFilePath } from "./main";
import { getSettings } from "./preferences";

let tabsActive = false;
let isSwitching = false; // prevent recursive save during switch

export function isTabsEnabled(): boolean {
  return getSettings().tabsEnabled;
}

export function enableTabs() {
  if (tabsActive) return;
  tabsActive = true;
  setTabBarVisible(true);

  // If there's already a tab (e.g., called twice), don't duplicate
  if (tabManager.tabs.length > 0) return;

  // If there's content already in the editor (from startup), create a tab for it
  const path = getFilePath();
  const content = getEditorContent();
  if (content || path) {
    tabManager.addTab(path || undefined, content);
    if (!getIsDirty() && path) {
      tabManager.updateActive({ isDirty: false });
    }
  } else {
    // Create an initial blank tab
    tabManager.addTab();
  }
}

export function disableTabs() {
  tabsActive = false;
  setTabBarVisible(false);
  // Collapse tabs into the current editor state
  const active = tabManager.getActive();
  if (active) {
    setEditorContent(active.content);
    setFilePath(active.filePath);
    setDirty(active.isDirty);
  }
}

/**
 * Called from the tab bar or keyboard shortcuts.
 * `action` is "switch", "close", or "new"
 */
export async function requestTabSwitch(
  action: "switch" | "close" | "new" | "prev" | "next",
  tabId?: string
) {
  if (action === "new") {
    saveCurrentTab();
    tabManager.addTab();
    loadActiveTab();
    return;
  }

  if (action === "prev") {
    saveCurrentTab();
    tabManager.prevTab();
    loadActiveTab();
    return;
  }

  if (action === "next") {
    saveCurrentTab();
    tabManager.nextTab();
    loadActiveTab();
    return;
  }

  if (action === "switch" && tabId) {
    if (tabId === tabManager.activeTabId) return;
    saveCurrentTab();
    tabManager.switchTab(tabId);
    loadActiveTab();
    return;
  }

  if (action === "close" && tabId) {
    const tab = tabManager.getTab(tabId);
    if (tab && tab.isDirty) {
      const confirmed = await confirmCloseTab();
      if (!confirmed) return;
    }

    saveCurrentTab();

    const result = tabManager.closeTab(tabId);
    if (!result.allowed) return;

    if (tabManager.tabs.length === 0) {
      // No more tabs — close the window
      setEditorContent("");
      setFilePath(null);
      setDirty(false);
      tabManager.addTab(); // empty tab as fallback
      loadActiveTab();
    } else {
      loadActiveTab();
    }
    return;
  }
}

/** Save current editor content into active tab */
export function saveCurrentTab() {
  if (!tabsActive || isSwitching) return;
  const content = getEditorContent();
  tabManager.saveActiveContent(content);
  // Sync dirty/filePath
  tabManager.updateActive({
    filePath: getFilePath(),
    isDirty: getIsDirty(),
  });
}

/** Load active tab into editor */
function loadActiveTab() {
  isSwitching = true;
  const tab = tabManager.getActive();
  if (tab) {
    setEditorContent(tab.content);
    setFilePath(tab.filePath);
    setDirty(tab.isDirty);
  }
  isSwitching = false;
}

/**
 * Called by bridge.ts when a file is opened (via menu, Cmd+O, or Finder).
 * If tabs are enabled, add/switch to tab instead of replacing content.
 */
export function handleFileOpen(path: string, content: string) {
  if (!tabsActive) return false;

  // Check if file is already open in a tab
  const existing = findTabByPath(path);
  if (existing) {
    saveCurrentTab();
    tabManager.switchTab(existing.id);
    loadActiveTab();
    return true;
  }

  saveCurrentTab();
  tabManager.addTab(path, content);
  tabManager.updateActive({ isDirty: false });
  loadActiveTab();
  return true;
}

/**
 * Called when the user saves a file — update the active tab's path
 */
export function onTabFileSaved(path: string) {
  if (!tabsActive) return;
  tabManager.updateActive({ filePath: path, isDirty: false });
  // Update title from filename
  const fname = path.split("/").pop();
  if (fname) tabManager.updateActive({ title: fname });
}

async function confirmCloseTab(): Promise<boolean> {
  try {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return await ask("This tab has unsaved changes. Close anyway?", {
      title: "Unsaved Changes",
      kind: "warning",
    });
  } catch {
    return true;
  }
}

/**
 * Initialize tabs on startup — check settings and set up
 */
export async function initTabs() {
  // Listen for tab actions from tab-bar UI
  document.addEventListener("tab-action", ((e: CustomEvent) => {
    const { action, tabId } = e.detail;
    requestTabSwitch(action, tabId);
  }) as EventListener);

  if (isTabsEnabled()) {
    enableTabs();
  }

  // Listen for settings changes to toggle tabs
  document.addEventListener("tab-mode-changed", ((e: CustomEvent) => {
    if (e.detail?.enabled) {
      enableTabs();
    } else {
      disableTabs();
    }
  }) as EventListener);
}
