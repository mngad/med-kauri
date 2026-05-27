// Tab bar UI rendering and event handling
import { tabManager } from "./tabs";

let tabBarEl: HTMLElement | null = null;

function emitTabAction(action: "switch" | "close" | "new" | "prev" | "next", tabId?: string) {
  const detail = tabId ? { action, tabId } : { action };
  document.dispatchEvent(new CustomEvent("tab-action", { detail }));
}

export function initTabBar() {
  tabBarEl = document.getElementById("tab-bar");
  if (!tabBarEl) {
    tabBarEl = document.createElement("div");
    tabBarEl.id = "tab-bar";
    const mainContent = document.getElementById("main-content");
    if (mainContent && mainContent.parentNode) {
      mainContent.parentNode.insertBefore(tabBarEl, mainContent);
    }
  }

  tabBarEl.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const closeBtn = target.closest(".tab-close");
    if (closeBtn) {
      e.stopPropagation();
      const tabId = (closeBtn.closest(".tab-item") as HTMLElement)?.dataset.tabId;
      if (tabId) emitTabAction("close", tabId);
      return;
    }

    const tabItem = target.closest(".tab-item");
    if (tabItem) {
      const tabId = (tabItem as HTMLElement).dataset.tabId;
      if (tabId && tabId !== tabManager.activeTabId) {
        emitTabAction("switch", tabId);
      }
      return;
    }

    const newBtn = target.closest(".tab-new");
    if (newBtn) {
      emitTabAction("new");
    }
  });
}

export function renderTabBar() {
  if (!tabBarEl) return;

  const tabs = tabManager.tabs;
  const activeId = tabManager.activeTabId;

  // Hide if only 1 tab (or 0)
  if (tabs.length <= 1) {
    tabBarEl.style.display = "none";
    return;
  }

  tabBarEl.style.display = "flex";

  const tabsHtml = tabs
    .map((tab) => {
      const isActive = tab.id === activeId;
      const dirty = tab.isDirty ? " ●" : "";
      return `
        <div class="tab-item ${isActive ? "active" : ""}" data-tab-id="${tab.id}" title="${tab.filePath || tab.title}">
          <span class="tab-title">${escapeHtml(tab.title)}${dirty}</span>
          <button class="tab-close" title="Close tab">×</button>
        </div>
      `;
    })
    .join("");

  tabBarEl.innerHTML = tabsHtml + `<button class="tab-new" title="New tab">+</button>`;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
