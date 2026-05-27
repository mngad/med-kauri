import { invoke } from "@tauri-apps/api/core";
import { getEditor, setEditorTheme } from "./editor";

// Settings state
const settings = {
  theme: "light" as string,
  editorFont: "JetBrains Mono",
  editorSize: 13,
  previewFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI'",
  previewSize: 16,
};

const FONT_OPTIONS = [
  "JetBrains Mono",
  "Menlo",
  "Monaco",
  "Courier New",
  "Fira Code",
  "Source Code Pro",
  "Consolas",
];

const PREVIEW_FONT_OPTIONS = [
  "-apple-system, BlinkMacSystemFont, 'Segoe UI'",
  "Georgia, serif",
  "Merriweather, serif",
  "Inter, sans-serif",
  "system-ui, sans-serif",
];

export function getSettings() {
  return { ...settings };
}

export function setSettings(s: Partial<typeof settings>) {
  Object.assign(settings, s);
  applySettings();
}

export function applySettings() {
  const editorView = getEditor();
  const cmContent = editorView.dom.querySelector(".cm-content") as HTMLElement;
  if (cmContent) {
    cmContent.style.fontFamily = `${settings.editorFont}, monospace`;
    cmContent.style.fontSize = `${settings.editorSize}px`;
  }

  const preview = document.getElementById("preview")!;
  preview.style.fontFamily = settings.previewFont;
  preview.style.fontSize = `${settings.previewSize}px`;
}

export function showPreferences() {
  document.getElementById("prefs-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "prefs-overlay";
  overlay.innerHTML = `
    <div class="prefs-modal">
      <h2>Preferences</h2>
      <div class="prefs-section">
        <h3>Appearance</h3>
        <select id="prefs-theme">
          <option value="light" ${settings.theme === "light" ? "selected" : ""}>Light</option>
          <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark</option>
        </select>
      </div>
      <div class="prefs-section">
        <h3>Editor Font</h3>
        <select id="prefs-editor-font">
          ${FONT_OPTIONS.map((f) => `<option value="${f}" ${f === settings.editorFont ? "selected" : ""}>${f}</option>`).join("")}
        </select>
        <label>Size: <input type="number" id="prefs-editor-size" value="${settings.editorSize}" min="10" max="30"></label>
      </div>
      <div class="prefs-section">
        <h3>Preview Font</h3>
        <select id="prefs-preview-font">
          ${PREVIEW_FONT_OPTIONS.map((f) => `<option value="${f}" ${f === settings.previewFont ? "selected" : ""}>${f}</option>`).join("")}
        </select>
        <label>Size: <input type="number" id="prefs-preview-size" value="${settings.previewSize}" min="12" max="28"></label>
      </div>
      <div class="prefs-actions">
        <button id="prefs-close">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.getElementById("prefs-close")?.addEventListener("click", close);

  function close() {
    const newTheme = (document.getElementById("prefs-theme") as HTMLSelectElement).value;
    const isDark = newTheme === "dark";

    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    setEditorTheme(isDark);

    setSettings({
      theme: newTheme,
      editorFont: (document.getElementById("prefs-editor-font") as HTMLSelectElement).value,
      editorSize: parseInt((document.getElementById("prefs-editor-size") as HTMLInputElement).value, 10),
      previewFont: (document.getElementById("prefs-preview-font") as HTMLSelectElement).value,
      previewSize: parseInt((document.getElementById("prefs-preview-size") as HTMLInputElement).value, 10),
    });

    const s = getSettings();
    invoke("update_settings", {
      settings: {
        theme: s.theme,
        editor_font: s.editorFont,
        editor_size: s.editorSize,
        preview_font: s.previewFont,
        preview_size: s.previewSize,
      },
    }).catch(() => {});

    overlay.remove();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(applySettings, 100);
});
