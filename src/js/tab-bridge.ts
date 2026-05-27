// Bridge between tab manager and the rest of the app
import { tabManager, findTabByPath } from "./tabs";
import { renderTabBar } from "./tab-bar";
import { getEditorContent, setEditorContent } from "./editor";
import { setFilePath, setDirty, getIsDirty, getFilePath } from "./main";

let isSwitching = false;
let tabsInited = false;

export function ensureTabsInited() {
  if (tabsInited) return;
  tabsInited = true;

  // Listen for tab actions from tab-bar UI
  document.addEventListener("tab-action", ((e: CustomEvent) => {
    const { action, tabId } = e.detail;
    requestTabSwitch(action, tabId);
  }) as EventListener);

  // If there's content already in the editor (from startup), create a tab for it
  const path = getFilePath();
  const content = getEditorContent();
  if (path || content) {
    tabManager.addTab(path || undefined, content);
    tabManager.updateActive({ isDirty: getIsDirty() });
  } else {
    tabManager.addTab();
  }

  tabManager.onChange(() => renderTabBar());
  renderTabBar();
}

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
      setEditorContent("");
      setFilePath(null);
      setDirty(false);
      tabManager.addTab();
      loadActiveTab();
    } else {
      loadActiveTab();
    }
    return;
  }
}

export function saveCurrentTab() {
  if (isSwitching || !tabsInited) return;
  const content = getEditorContent();
  tabManager.saveActiveContent(content);
  tabManager.updateActive({
    filePath: getFilePath(),
    isDirty: getIsDirty(),
  });
}

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

export function handleFileOpen(path: string, content: string): boolean {
  if (!tabsInited) return false;

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

export function onTabFileSaved(path: string) {
  if (!tabsInited) return;
  tabManager.updateActive({ filePath: path, isDirty: false });
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
