// Tab state management

export interface Tab {
  id: string;
  filePath: string | null;
  title: string;
  content: string;
  isDirty: boolean;
}

let tabIdCounter = 0;

function generateId(): string {
  return `tab-${++tabIdCounter}-${Date.now()}`;
}

class TabManager {
  tabs: Tab[] = [];
  activeTabId: string | null = null;
  private listeners: Array<() => void> = [];

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  /** Add a new tab. Returns the created tab. */
  addTab(filePath?: string, content?: string): Tab {
    const title = filePath
      ? filePath.split("/").pop() || "Untitled"
      : "Untitled";
    const tab: Tab = {
      id: generateId(),
      filePath: filePath || null,
      title,
      content: content || "",
      isDirty: false,
    };
    this.tabs.push(tab);
    this.activeTabId = tab.id;
    this.notify();
    return tab;
  }

  /** Close a tab by id. Returns true if closed, false if cancelled (dirty). */
  closeTab(id: string): { allowed: boolean; nextActive: string | null } {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return { allowed: false, nextActive: null };

    // Determine next active tab
    let nextActive: string | null = null;
    if (this.activeTabId === id) {
      if (this.tabs.length > 1) {
        const nextIdx = idx > 0 ? idx - 1 : idx + 1;
        nextActive = this.tabs[nextIdx].id;
      }
    }

    this.tabs.splice(idx, 1);

    if (this.tabs.length === 0) {
      this.activeTabId = null;
    } else if (this.activeTabId === id) {
      this.activeTabId = nextActive;
    }

    this.notify();
    return { allowed: true, nextActive };
  }

  /** Switch to a tab by id */
  switchTab(id: string) {
    if (this.tabs.some((t) => t.id === id)) {
      this.activeTabId = id;
      this.notify();
    }
  }

  /** Switch to next tab (cycling) */
  nextTab() {
    if (this.tabs.length < 2) return;
    const idx = this.tabs.findIndex((t) => t.id === this.activeTabId);
    const nextIdx = (idx + 1) % this.tabs.length;
    this.activeTabId = this.tabs[nextIdx].id;
    this.notify();
  }

  /** Switch to previous tab (cycling) */
  prevTab() {
    if (this.tabs.length < 2) return;
    const idx = this.tabs.findIndex((t) => t.id === this.activeTabId);
    const prevIdx = (idx - 1 + this.tabs.length) % this.tabs.length;
    this.activeTabId = this.tabs[prevIdx].id;
    this.notify();
  }

  /** Save the current editor content into the active tab */
  saveActiveContent(content: string) {
    const tab = this.getActive();
    if (tab) {
      tab.content = content;
    }
  }

  /** Update filePath and dirty on active tab */
  updateActive(updates: { filePath?: string | null; isDirty?: boolean; title?: string }) {
    const tab = this.getActive();
    if (!tab) return;
    if (updates.filePath !== undefined) tab.filePath = updates.filePath;
    if (updates.isDirty !== undefined) tab.isDirty = updates.isDirty;
    if (updates.title !== undefined) tab.title = updates.title;
  }

  getActive(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeTabId) || null;
  }

  getTab(id: string): Tab | null {
    return this.tabs.find((t) => t.id === id) || null;
  }

  get count(): number {
    return this.tabs.length;
  }
}

export const tabManager = new TabManager();

/** Check if the given filePath is already open in a tab */
export function findTabByPath(filePath: string): Tab | null {
  return tabManager.tabs.find((t) => t.filePath === filePath) || null;
}
