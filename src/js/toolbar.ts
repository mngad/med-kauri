import { wrapSelection, toggleLinePrefix, insertAtCursor } from "./editor";

export function setupToolbar() {
  document.getElementById("btn-bold")?.addEventListener("click", () => wrapSelection("**"));
  document.getElementById("btn-italic")?.addEventListener("click", () => wrapSelection("*"));
  document.getElementById("btn-heading")?.addEventListener("click", () => toggleLinePrefix("#"));
  document.getElementById("btn-list")?.addEventListener("click", () => toggleLinePrefix("-"));
  document.getElementById("btn-link")?.addEventListener("click", () => {
    wrapSelection("[");
    insertAtCursor("](url)");
  });
  document.getElementById("btn-code")?.addEventListener("click", () => wrapSelection("`"));
}
